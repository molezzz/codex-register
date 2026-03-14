"""
Outlook 邮箱服务实现
支持 IMAP 协议，XOAUTH2 和密码认证
"""

import imaplib
import email
import re
import time
import threading
import json
import urllib.parse
import urllib.request
import base64
import hashlib
import secrets
import logging
from typing import Optional, Dict, Any, List
from email.header import decode_header
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError

from .base import BaseEmailService, EmailServiceError, EmailServiceType
from ..config.constants import OTP_CODE_PATTERN


logger = logging.getLogger(__name__)


class OutlookAccount:
    """Outlook 账户信息"""

    def __init__(
        self,
        email: str,
        password: str,
        client_id: str = "",
        refresh_token: str = ""
    ):
        self.email = email
        self.password = password
        self.client_id = client_id
        self.refresh_token = refresh_token

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "OutlookAccount":
        """从配置创建账户"""
        return cls(
            email=config.get("email", ""),
            password=config.get("password", ""),
            client_id=config.get("client_id", ""),
            refresh_token=config.get("refresh_token", "")
        )

    def has_oauth(self) -> bool:
        """是否支持 OAuth2"""
        return bool(self.client_id and self.refresh_token)

    def validate(self) -> bool:
        """验证账户信息是否有效"""
        return bool(self.email and self.password) or self.has_oauth()


class OutlookIMAPClient:
    """
    Outlook IMAP 客户端
    支持 XOAUTH2 和密码认证
    """

    # Microsoft OAuth2 Token 缓存
    _token_cache: Dict[str, tuple] = {}
    _cache_lock = threading.Lock()

    def __init__(
        self,
        account: OutlookAccount,
        host: str = "outlook.office365.com",
        port: int = 993,
        timeout: int = 20
    ):
        self.account = account
        self.host = host
        self.port = port
        self.timeout = timeout
        self._conn: Optional[imaplib.IMAP4_SSL] = None

    @staticmethod
    def refresh_ms_token(account: OutlookAccount, timeout: int = 15) -> str:
        """刷新 Microsoft access token"""
        if not account.client_id or not account.refresh_token:
            raise RuntimeError("缺少 client_id 或 refresh_token")

        key = account.email.lower()
        with OutlookIMAPClient._cache_lock:
            cached = OutlookIMAPClient._token_cache.get(key)
            if cached and time.time() < cached[1]:
                return cached[0]

        body = urllib.parse.urlencode({
            "client_id": account.client_id,
            "refresh_token": account.refresh_token,
            "grant_type": "refresh_token",
            "redirect_uri": "https://login.live.com/oauth20_desktop.srf",
        }).encode()

        req = urllib.request.Request(
            "https://login.live.com/oauth20_token.srf",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read())
        except HTTPError as e:
            raise RuntimeError(f"MS OAuth 刷新失败: {e.code}") from e

        token = data.get("access_token")
        if not token:
            raise RuntimeError("MS OAuth 响应无 access_token")

        ttl = int(data.get("expires_in", 3600))
        with OutlookIMAPClient._cache_lock:
            OutlookIMAPClient._token_cache[key] = (token, time.time() + ttl - 120)

        return token

    @staticmethod
    def _build_xoauth2(email_addr: str, token: str) -> bytes:
        """构建 XOAUTH2 认证字符串"""
        return f"user={email_addr}\x01auth=Bearer {token}\x01\x01".encode()

    def connect(self):
        """连接到 IMAP 服务器"""
        self._conn = imaplib.IMAP4_SSL(self.host, self.port, timeout=self.timeout)

        # 优先使用 XOAUTH2 认证
        if self.account.has_oauth():
            try:
                token = self.refresh_ms_token(self.account)
                self._conn.authenticate(
                    "XOAUTH2",
                    lambda _: self._build_xoauth2(self.account.email, token)
                )
                logger.debug(f"使用 XOAUTH2 认证连接: {self.account.email}")
                return
            except Exception as e:
                logger.warning(f"XOAUTH2 认证失败，回退密码认证: {e}")

        # 回退到密码认证
        self._conn.login(self.account.email, self.account.password)
        logger.debug(f"使用密码认证连接: {self.account.email}")

    def _ensure_connection(self):
        """确保连接有效"""
        if self._conn:
            try:
                self._conn.noop()
                return
            except Exception:
                self.close()

        self.connect()

    def get_recent_emails(
        self,
        count: int = 20,
        only_unseen: bool = True,
        timeout: int = 30
    ) -> List[Dict[str, Any]]:
        """
        获取最近的邮件

        Args:
            count: 获取的邮件数量
            only_unseen: 是否只获取未读邮件
            timeout: 超时时间

        Returns:
            邮件列表
        """
        self._ensure_connection()

        flag = "UNSEEN" if only_unseen else "ALL"
        self._conn.select("INBOX", readonly=True)

        _, data = self._conn.search(None, flag)
        if not data or not data[0]:
            return []

        # 获取最新的邮件
        ids = data[0].split()[-count:]
        result = []

        for mid in reversed(ids):
            try:
                _, payload = self._conn.fetch(mid, "(RFC822)")
                if not payload:
                    continue

                raw = b""
                for part in payload:
                    if isinstance(part, tuple) and len(part) > 1:
                        raw = part[1]
                        break

                if raw:
                    result.append(self._parse_email(raw))
            except Exception as e:
                logger.warning(f"解析邮件失败 (ID: {mid}): {e}")

        return result

    @staticmethod
    def _parse_email(raw: bytes) -> Dict[str, Any]:
        """解析邮件内容"""
        # 移除可能的 BOM
        if raw.startswith(b"\xef\xbb\xbf"):
            raw = raw[3:]

        msg = email.message_from_bytes(raw)

        # 解析邮件头
        subject = OutlookIMAPClient._decode_header(msg.get("Subject", ""))
        sender = OutlookIMAPClient._decode_header(msg.get("From", ""))
        date_str = OutlookIMAPClient._decode_header(msg.get("Date", ""))
        to = OutlookIMAPClient._decode_header(msg.get("To", ""))
        delivered_to = OutlookIMAPClient._decode_header(msg.get("Delivered-To", ""))
        x_original_to = OutlookIMAPClient._decode_header(msg.get("X-Original-To", ""))

        # 提取邮件正文
        body = OutlookIMAPClient._extract_body(msg)

        # 解析日期
        date_timestamp = 0
        try:
            if date_str:
                dt = parsedate_to_datetime(date_str)
                date_timestamp = int(dt.timestamp())
        except Exception:
            pass

        return {
            "subject": subject,
            "from": sender,
            "date": date_str,
            "date_timestamp": date_timestamp,
            "to": to,
            "delivered_to": delivered_to,
            "x_original_to": x_original_to,
            "body": body,
            "raw": raw.hex()[:100]  # 存储原始数据的部分哈希用于调试
        }

    @staticmethod
    def _decode_header(header: str) -> str:
        """解码邮件头"""
        if not header:
            return ""

        parts = []
        for chunk, encoding in decode_header(header):
            if isinstance(chunk, bytes):
                try:
                    decoded = chunk.decode(encoding or "utf-8", errors="replace")
                    parts.append(decoded)
                except Exception:
                    parts.append(chunk.decode("utf-8", errors="replace"))
            else:
                parts.append(chunk)

        return "".join(parts).strip()

    @staticmethod
    def _extract_body(msg) -> str:
        """提取邮件正文"""
        import html as html_module

        texts = []
        parts = msg.walk() if msg.is_multipart() else [msg]

        for part in parts:
            content_type = part.get_content_type()
            if content_type not in ("text/plain", "text/html"):
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                continue

            charset = part.get_content_charset() or "utf-8"
            try:
                text = payload.decode(charset, errors="replace")
            except LookupError:
                text = payload.decode("utf-8", errors="replace")

            # 如果是 HTML，移除标签
            if "<html" in text.lower():
                text = re.sub(r"<[^>]+>", " ", text)

            texts.append(text)

        # 合并并清理文本
        combined = " ".join(texts)
        combined = html_module.unescape(combined)
        combined = re.sub(r"\s+", " ", combined).strip()

        return combined

    def close(self):
        """关闭连接"""
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            try:
                self._conn.logout()
            except Exception:
                pass
            self._conn = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class OutlookService(BaseEmailService):
    """
    Outlook 邮箱服务
    支持多个 Outlook 账户的轮询和验证码获取
    """

    def __init__(self, config: Dict[str, Any] = None, name: str = None):
        """
        初始化 Outlook 服务

        Args:
            config: 配置字典，支持以下键:
                - accounts: Outlook 账户列表，每个账户包含:
                  - email: 邮箱地址
                  - password: 密码
                  - client_id: OAuth2 client_id (可选)
                  - refresh_token: OAuth2 refresh_token (可选)
                - imap_host: IMAP 服务器 (默认: outlook.office365.com)
                - imap_port: IMAP 端口 (默认: 993)
                - timeout: 超时时间 (默认: 30)
                - max_retries: 最大重试次数 (默认: 3)
            name: 服务名称
        """
        super().__init__(EmailServiceType.OUTLOOK, name)

        # 默认配置
        default_config = {
            "accounts": [],
            "imap_host": "outlook.office365.com",
            "imap_port": 993,
            "timeout": 30,
            "max_retries": 3,
            "proxy_url": None,
        }

        self.config = {**default_config, **(config or {})}

        # 解析账户
        self.accounts: List[OutlookAccount] = []
        self._current_account_index = 0
        self._account_locks: Dict[str, threading.Lock] = {}

        for account_config in self.config.get("accounts", []):
            account = OutlookAccount.from_config(account_config)
            if account.validate():
                self.accounts.append(account)
                self._account_locks[account.email] = threading.Lock()
            else:
                logger.warning(f"无效的 Outlook 账户配置: {account_config}")

        if not self.accounts:
            logger.warning("未配置有效的 Outlook 账户")

        # IMAP 连接限制（防止限流）
        self._imap_semaphore = threading.Semaphore(5)

    def create_email(self, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        选择可用的 Outlook 账户

        Args:
            config: 配置参数（目前未使用）

        Returns:
            包含邮箱信息的字典:
            - email: 邮箱地址
            - service_id: 账户邮箱（同 email）
            - account: 账户信息
        """
        if not self.accounts:
            self.update_status(False, EmailServiceError("没有可用的 Outlook 账户"))
            raise EmailServiceError("没有可用的 Outlook 账户")

        # 轮询选择账户
        with threading.Lock():
            account = self.accounts[self._current_account_index]
            self._current_account_index = (self._current_account_index + 1) % len(self.accounts)

        email_info = {
            "email": account.email,
            "service_id": account.email,  # 对于 Outlook，service_id 就是邮箱地址
            "account": {
                "email": account.email,
                "has_oauth": account.has_oauth()
            }
        }

        logger.info(f"选择 Outlook 账户: {account.email}")
        self.update_status(True)
        return email_info

    def get_verification_code(
        self,
        email: str,
        email_id: str = None,
        timeout: int = 120,
        pattern: str = OTP_CODE_PATTERN
    ) -> Optional[str]:
        """
        从 Outlook 邮箱获取验证码

        Args:
            email: 邮箱地址
            email_id: 未使用（对于 Outlook，email 就是标识）
            timeout: 超时时间（秒）
            pattern: 验证码正则表达式

        Returns:
            验证码字符串，如果超时或未找到返回 None
        """
        # 查找对应的账户
        account = None
        for acc in self.accounts:
            if acc.email.lower() == email.lower():
                account = acc
                break

        if not account:
            self.update_status(False, EmailServiceError(f"未找到邮箱对应的账户: {email}"))
            return None

        logger.info(f"正在从 Outlook 邮箱 {email} 获取验证码...")

        start_time = time.time()
        last_check_time = 0
        check_count = 0

        while time.time() - start_time < timeout:
            check_count += 1

            # 控制检查频率
            if time.time() - last_check_time < 3:
                time.sleep(1)
                continue

            try:
                with self._imap_semaphore:
                    with OutlookIMAPClient(
                        account,
                        host=self.config["imap_host"],
                        port=self.config["imap_port"],
                        timeout=10
                    ) as client:
                        emails = client.get_recent_emails(count=10, only_unseen=True)

                        for mail in emails:
                            # 检查是否是 OpenAI 相关邮件
                            if not self._is_oai_mail(mail):
                                continue

                            # 提取验证码
                            content = f"{mail.get('from', '')} {mail.get('subject', '')} {mail.get('body', '')}"
                            match = re.search(pattern, content)
                            if match:
                                code = match.group(1)
                                logger.info(f"从 Outlook 邮箱 {email} 找到验证码: {code}")

                                # 可选：标记邮件为已读（避免重复获取）
                                # 注意：这需要修改 IMAP 客户端的实现

                                self.update_status(True)
                                return code

                last_check_time = time.time()

                if check_count % 5 == 0:
                    logger.debug(f"检查 {email} 的验证码，已检查 {check_count} 次")

            except Exception as e:
                logger.warning(f"检查 Outlook 邮箱 {email} 时出错: {e}")
                last_check_time = time.time()

            time.sleep(3)

        logger.warning(f"等待验证码超时: {email}")
        return None

    def list_emails(self, **kwargs) -> List[Dict[str, Any]]:
        """
        列出所有可用的 Outlook 账户

        Returns:
            账户列表
        """
        return [
            {
                "email": account.email,
                "id": account.email,
                "has_oauth": account.has_oauth(),
                "type": "outlook"
            }
            for account in self.accounts
        ]

    def delete_email(self, email_id: str) -> bool:
        """
        删除邮箱（对于 Outlook，不支持删除账户）

        Args:
            email_id: 邮箱地址

        Returns:
            False（Outlook 不支持删除账户）
        """
        logger.warning(f"Outlook 服务不支持删除账户: {email_id}")
        return False

    def check_health(self) -> bool:
        """检查 Outlook 服务是否可用"""
        if not self.accounts:
            self.update_status(False, EmailServiceError("没有配置的账户"))
            return False

        # 测试第一个账户的连接
        test_account = self.accounts[0]
        try:
            with self._imap_semaphore:
                with OutlookIMAPClient(
                    test_account,
                    host=self.config["imap_host"],
                    port=self.config["imap_port"],
                    timeout=10
                ) as client:
                    # 尝试列出邮箱（快速测试）
                    client._conn.select("INBOX", readonly=True)
                    self.update_status(True)
                    return True
        except Exception as e:
            logger.warning(f"Outlook 健康检查失败 ({test_account.email}): {e}")
            self.update_status(False, e)
            return False

    def _is_oai_mail(self, mail: Dict[str, Any]) -> bool:
        """判断是否为 OpenAI 相关邮件"""
        combined = f"{mail.get('from', '')} {mail.get('subject', '')} {mail.get('body', '')}".lower()
        keywords = ["openai", "chatgpt", "verification", "验证码", "code"]
        return any(keyword in combined for keyword in keywords)

    def get_account_stats(self) -> Dict[str, Any]:
        """获取账户统计信息"""
        total = len(self.accounts)
        oauth_count = sum(1 for acc in self.accounts if acc.has_oauth())

        return {
            "total_accounts": total,
            "oauth_accounts": oauth_count,
            "password_accounts": total - oauth_count,
            "accounts": [
                {
                    "email": acc.email,
                    "has_oauth": acc.has_oauth()
                }
                for acc in self.accounts
            ]
        }

    def add_account(self, account_config: Dict[str, Any]) -> bool:
        """添加新的 Outlook 账户"""
        try:
            account = OutlookAccount.from_config(account_config)
            if not account.validate():
                return False

            self.accounts.append(account)
            self._account_locks[account.email] = threading.Lock()
            logger.info(f"添加 Outlook 账户: {account.email}")
            return True
        except Exception as e:
            logger.error(f"添加 Outlook 账户失败: {e}")
            return False

    def remove_account(self, email: str) -> bool:
        """移除 Outlook 账户"""
        for i, acc in enumerate(self.accounts):
            if acc.email.lower() == email.lower():
                self.accounts.pop(i)
                self._account_locks.pop(email, None)
                logger.info(f"移除 Outlook 账户: {email}")
                return True
        return False
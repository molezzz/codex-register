"""
配置管理 - Pydantic 设置模型
"""

import os
from typing import Optional, Dict, Any
from pydantic import Field, field_validator
from pydantic.types import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    应用配置
    优先级：环境变量 > .env 文件 > 默认值
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 应用信息
    app_name: str = Field(default="OpenAI/Codex CLI 自动注册系统")
    app_version: str = Field(default="2.0.0")
    debug: bool = Field(default=False)

    # 数据库配置
    database_url: str = Field(
        default=os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'data',
            'database.db'
        )
    )

    @field_validator('database_url', mode='before')
    @classmethod
    def validate_database_url(cls, v):
        if isinstance(v, str) and v.startswith("sqlite:///"):
            return v
        if isinstance(v, str) and not v.startswith(("sqlite:///", "postgresql://", "mysql://")):
            # 如果是文件路径，转换为 SQLite URL
            if os.path.isabs(v) or ":/" not in v:
                return f"sqlite:///{v}"
        return v

    # Web UI 配置
    webui_host: str = Field(default="0.0.0.0")
    webui_port: int = Field(default=8000)
    webui_secret_key: SecretStr = Field(
        default=SecretStr("your-secret-key-change-in-production")
    )

    # 日志配置
    log_level: str = Field(default="INFO")
    log_file: str = Field(default="logs/app.log")
    log_retention_days: int = Field(default=30)

    # OpenAI 配置
    openai_client_id: str = Field(default="app_EMoamEEZ73f0CkXaXp7hrann")
    openai_auth_url: str = Field(default="https://auth.openai.com/oauth/authorize")
    openai_token_url: str = Field(default="https://auth.openai.com/oauth/token")
    openai_redirect_uri: str = Field(default="http://localhost:1455/auth/callback")
    openai_scope: str = Field(default="openid email profile offline_access")

    # 代理配置
    proxy_enabled: bool = Field(default=False)
    proxy_type: str = Field(default="http")  # http, socks5
    proxy_host: str = Field(default="127.0.0.1")
    proxy_port: int = Field(default=7890)
    proxy_username: Optional[str] = Field(default=None)
    proxy_password: Optional[SecretStr] = Field(default=None)

    @property
    def proxy_url(self) -> Optional[str]:
        """获取完整的代理 URL"""
        if not self.proxy_enabled:
            return None

        if self.proxy_type == "http":
            scheme = "http"
        elif self.proxy_type == "socks5":
            scheme = "socks5"
        else:
            return None

        auth = ""
        if self.proxy_username and self.proxy_password:
            auth = f"{self.proxy_username}:{self.proxy_password.get_secret_value()}@"

        return f"{scheme}://{auth}{self.proxy_host}:{self.proxy_port}"

    # 注册配置
    registration_max_retries: int = Field(default=3)
    registration_timeout: int = Field(default=120)  # 秒
    registration_default_password_length: int = Field(default=12)
    registration_sleep_min: int = Field(default=5)
    registration_sleep_max: int = Field(default=30)

    # 邮箱服务配置
    email_service_priority: Dict[str, int] = Field(
        default={"tempmail": 0, "outlook": 1, "custom_domain": 2}
    )

    # Tempmail.lol 配置
    tempmail_base_url: str = Field(default="https://api.tempmail.lol/v2")
    tempmail_timeout: int = Field(default=30)
    tempmail_max_retries: int = Field(default=3)

    # 自定义域名邮箱配置
    custom_domain_base_url: str = Field(default="")
    custom_domain_api_key: Optional[SecretStr] = Field(default=None)

    # 安全配置
    encryption_key: SecretStr = Field(
        default=SecretStr("your-encryption-key-change-in-production")
    )


# 全局配置实例
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """
    获取全局配置实例（单例模式）
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def update_settings(**kwargs) -> Settings:
    """
    更新配置（用于测试或运行时配置更改）
    """
    global _settings
    if _settings is None:
        _settings = Settings()

    # 创建新的配置实例
    updated_data = _settings.model_dump()
    updated_data.update(kwargs)
    _settings = Settings(**updated_data)
    return _settings


def get_database_url() -> str:
    """
    获取数据库 URL（处理相对路径）
    """
    settings = get_settings()
    url = settings.database_url

    # 如果 URL 是相对路径，转换为绝对路径
    if url.startswith("sqlite:///"):
        path = url[10:]  # 移除 "sqlite:///"
        if not os.path.isabs(path):
            # 转换为相对于项目根目录的路径
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            abs_path = os.path.join(project_root, path)
            return f"sqlite:///{abs_path}"

    return url

"""
数据库初始化和初始化数据
"""

import json
from datetime import datetime
from .session import init_database
from .crud import set_setting
from .models import Base


def init_default_settings(db):
    """初始化默认设置"""
    # 通用设置
    default_settings = [
        ("system.name", "OpenAI/Codex CLI 自动注册系统", "系统名称", "general"),
        ("system.version", "2.0.0", "系统版本", "general"),
        ("logs.retention_days", "30", "日志保留天数", "general"),

        # OpenAI 配置
        ("openai.client_id", "app_EMoamEEZ73f0CkXaXp7hrann", "OpenAI OAuth Client ID", "openai"),
        ("openai.auth_url", "https://auth.openai.com/oauth/authorize", "OpenAI 认证地址", "openai"),
        ("openai.token_url", "https://auth.openai.com/oauth/token", "OpenAI Token 地址", "openai"),
        ("openai.redirect_uri", "http://localhost:1455/auth/callback", "OpenAI 回调地址", "openai"),
        ("openai.scope", "openid email profile offline_access", "OpenAI 权限范围", "openai"),

        # 代理设置
        ("proxy.enabled", "false", "是否启用代理", "proxy"),
        ("proxy.type", "http", "代理类型 (http/socks5)", "proxy"),
        ("proxy.host", "127.0.0.1", "代理主机", "proxy"),
        ("proxy.port", "7890", "代理端口", "proxy"),

        # 注册设置
        ("registration.max_retries", "3", "最大重试次数", "registration"),
        ("registration.timeout", "120", "超时时间（秒）", "registration"),
        ("registration.default_password_length", "12", "默认密码长度", "registration"),

        # Web UI 设置
        ("webui.host", "0.0.0.0", "Web UI 监听主机", "webui"),
        ("webui.port", "8000", "Web UI 监听端口", "webui"),
        ("webui.debug", "true", "调试模式", "webui"),
    ]

    for key, value, description, category in default_settings:
        set_setting(db, key, value, description, category)


def init_default_email_services(db):
    """初始化默认邮箱服务（仅模板，需要用户配置）"""
    # 这里只创建模板配置，实际配置需要用户通过 Web UI 设置
    pass


def initialize_database(database_url: str = None):
    """
    初始化数据库
    创建所有表并设置默认配置
    """
    # 初始化数据库连接和表
    db_manager = init_database(database_url)

    # 在事务中设置默认配置
    with db_manager.session_scope() as session:
        # 初始化默认设置
        init_default_settings(session)

        # 初始化默认邮箱服务
        init_default_email_services(session)

    print("数据库初始化完成")
    return db_manager


def reset_database(database_url: str = None):
    """
    重置数据库（删除所有表并重新创建）
    警告：会丢失所有数据！
    """
    db_manager = init_database(database_url)

    # 删除所有表
    db_manager.drop_tables()
    print("已删除所有表")

    # 重新创建所有表
    db_manager.create_tables()
    print("已重新创建所有表")

    # 初始化数据
    with db_manager.session_scope() as session:
        init_default_settings(session)

    print("数据库重置完成")
    return db_manager


def check_database_connection(database_url: str = None) -> bool:
    """
    检查数据库连接是否正常
    """
    try:
        db_manager = init_database(database_url)
        with db_manager.get_db() as db:
            # 尝试执行一个简单的查询
            db.execute("SELECT 1")
        print("数据库连接正常")
        return True
    except Exception as e:
        print(f"数据库连接失败: {e}")
        return False


if __name__ == "__main__":
    # 当直接运行此脚本时，初始化数据库
    import argparse

    parser = argparse.ArgumentParser(description="数据库初始化脚本")
    parser.add_argument("--reset", action="store_true", help="重置数据库（删除所有数据）")
    parser.add_argument("--check", action="store_true", help="检查数据库连接")
    parser.add_argument("--url", help="数据库连接字符串")

    args = parser.parse_args()

    if args.check:
        check_database_connection(args.url)
    elif args.reset:
        confirm = input("警告：这将删除所有数据！确认重置？(y/N): ")
        if confirm.lower() == 'y':
            reset_database(args.url)
        else:
            print("操作已取消")
    else:
        initialize_database(args.url)
"""
数据库会话管理
"""

from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
import os

from .models import Base


class DatabaseSessionManager:
    """数据库会话管理器"""

    def __init__(self, database_url: str = None):
        if database_url is None:
            # 默认使用项目根目录下的 SQLite 数据库
            db_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'data',
                'database.db'
            )
            # 确保目录存在
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            database_url = f"sqlite:///{db_path}"

        self.database_url = database_url
        self.engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
            echo=False,  # 设置为 True 可以查看所有 SQL 语句
            pool_pre_ping=True  # 连接池预检查
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def get_db(self) -> Generator[Session, None, None]:
        """
        获取数据库会话的上下文管理器
        使用示例:
            with get_db() as db:
                # 使用 db 进行数据库操作
                pass
        """
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def session_scope(self) -> Generator[Session, None, None]:
        """
        事务作用域上下文管理器
        使用示例:
            with session_scope() as session:
                # 数据库操作
                pass
        """
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def create_tables(self):
        """创建所有表"""
        Base.metadata.create_all(bind=self.engine)

    def drop_tables(self):
        """删除所有表（谨慎使用）"""
        Base.metadata.drop_all(bind=self.engine)


# 全局数据库会话管理器实例
_db_manager: DatabaseSessionManager = None


def init_database(database_url: str = None) -> DatabaseSessionManager:
    """
    初始化数据库会话管理器
    """
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseSessionManager(database_url)
        _db_manager.create_tables()
    return _db_manager


def get_session_manager() -> DatabaseSessionManager:
    """
    获取数据库会话管理器
    """
    if _db_manager is None:
        raise RuntimeError("数据库未初始化，请先调用 init_database()")
    return _db_manager


@contextmanager
def get_db() -> Generator[Session, None, None]:
    """
    获取数据库会话的快捷函数
    """
    manager = get_session_manager()
    db = manager.SessionLocal()
    try:
        yield db
    finally:
        db.close()
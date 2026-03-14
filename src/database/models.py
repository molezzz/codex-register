"""
SQLAlchemy ORM 模型定义
"""

from datetime import datetime
from typing import Optional, Dict, Any
import json
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import relationship

Base = declarative_base()


class JSONEncodedDict(TypeDecorator):
    """JSON 编码字典类型"""
    impl = Text

    def process_bind_param(self, value: Optional[Dict[str, Any]], dialect):
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value: Optional[str], dialect):
        if value is None:
            return None
        return json.loads(value)


class Account(Base):
    """已注册账号表"""
    __tablename__ = 'accounts'

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255))
    access_token = Column(Text)
    refresh_token = Column(Text)
    id_token = Column(Text)
    account_id = Column(String(255))
    workspace_id = Column(String(255))
    email_service = Column(String(50), nullable=False)  # 'tempmail', 'outlook', 'custom_domain'
    email_service_id = Column(String(255))  # 邮箱服务中的ID
    proxy_used = Column(String(255))
    registered_at = Column(DateTime, default=datetime.utcnow)
    last_refresh = Column(DateTime)
    expires_at = Column(DateTime)
    status = Column(String(20), default='active')  # 'active', 'expired', 'banned', 'failed'
    extra_data = Column(JSONEncodedDict)  # 额外信息存储
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'email': self.email,
            'email_service': self.email_service,
            'account_id': self.account_id,
            'workspace_id': self.workspace_id,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None,
            'status': self.status,
            'proxy_used': self.proxy_used,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class EmailService(Base):
    """邮箱服务配置表"""
    __tablename__ = 'email_services'

    id = Column(Integer, primary_key=True, autoincrement=True)
    service_type = Column(String(50), nullable=False)  # 'outlook', 'custom_domain'
    name = Column(String(100), nullable=False)
    config = Column(JSONEncodedDict, nullable=False)  # 服务配置（加密存储）
    enabled = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # 使用优先级
    last_used = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RegistrationTask(Base):
    """注册任务表"""
    __tablename__ = 'registration_tasks'

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_uuid = Column(String(36), unique=True, nullable=False, index=True)  # 任务唯一标识
    status = Column(String(20), default='pending')  # 'pending', 'running', 'completed', 'failed', 'cancelled'
    email_service_id = Column(Integer, ForeignKey('email_services.id'), index=True)  # 使用的邮箱服务
    proxy = Column(String(255))  # 使用的代理
    logs = Column(Text)  # 注册过程日志
    result = Column(JSONEncodedDict)  # 注册结果
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    # 关系
    email_service = relationship('EmailService')


class Setting(Base):
    """系统设置表"""
    __tablename__ = 'settings'

    key = Column(String(100), primary_key=True)
    value = Column(Text)
    description = Column(Text)
    category = Column(String(50), default='general')  # 'general', 'email', 'proxy', 'openai'
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
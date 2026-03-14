"""
API 路由模块
"""

from fastapi import APIRouter

from .accounts import router as accounts_router
from .registration import router as registration_router
from .settings import router as settings_router
from .email_services import router as email_services_router

api_router = APIRouter()

# 注册各模块路由
api_router.include_router(accounts_router, prefix="/accounts", tags=["accounts"])
api_router.include_router(registration_router, prefix="/registration", tags=["registration"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(email_services_router, prefix="/email-services", tags=["email-services"])

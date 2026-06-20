"""用户白名单鉴权与 JWT 签发。"""
import os
from datetime import datetime, timedelta, timezone

import jwt

APP_ENV = os.getenv("APP_ENV", "development")
SECRET = os.getenv("APP_SECRET", "dev-secret-change-in-production")

# 生产模式强制 APP_SECRET，开发模式警告
if APP_ENV == "production":
    if SECRET == "dev-secret-change-in-production":
        raise RuntimeError(
            "生产模式下必须设置 APP_SECRET 环境变量。"
            "请生成一个强随机密钥(≥32字节)并通过 APP_SECRET 环境变量提供。"
        )
elif SECRET == "dev-secret-change-in-production":
    print("⚠️  警告: 正在使用默认 JWT secret。生产部署前请设置 APP_SECRET 环境变量。")

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8


def is_allowed(username: str) -> bool:
    """检查用户是否在白名单。从 db 查询 allowed 字段。"""
    from . import db
    return db.is_allowed(username)


def create_token(username: str) -> str:
    """为白名单用户签发 JWT。"""
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "name": username,
        "exp": expires_at,
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    """验证 JWT，返回 payload 或 None。"""
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

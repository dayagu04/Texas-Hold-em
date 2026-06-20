"""用户白名单鉴权与 JWT 签发。"""
import os
from datetime import datetime, timedelta, timezone

import jwt

SECRET = os.getenv("APP_SECRET", "dev-secret-change-in-production")
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

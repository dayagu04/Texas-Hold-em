"""用户白名单鉴权与 JWT 签发。"""
import json
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone

import jwt

ALLOWED_FILE = Path(__file__).parent.parent / "allowed_users.json"
SECRET = os.getenv("APP_SECRET", "dev-secret-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 8


def load_allowed_users() -> set[str]:
    if not ALLOWED_FILE.exists():
        return set()
    return set(json.loads(ALLOWED_FILE.read_text())["allowed_users"])


def is_allowed(username: str) -> bool:
    return username in load_allowed_users()


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

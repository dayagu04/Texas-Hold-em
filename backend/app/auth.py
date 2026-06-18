"""用户白名单鉴权。"""
import json
from pathlib import Path

ALLOWED_FILE = Path(__file__).parent.parent / "allowed_users.json"


def load_allowed_users() -> set[str]:
    if not ALLOWED_FILE.exists():
        return set()
    return set(json.loads(ALLOWED_FILE.read_text())["allowed_users"])


def is_allowed(username: str) -> bool:
    return username in load_allowed_users()

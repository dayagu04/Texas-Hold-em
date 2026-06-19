"""用户资料管理模块。"""
import json
from pathlib import Path
from typing import Optional

PROFILES_FILE = Path(__file__).parent.parent / "user_profiles.json"


def load_profile(username: str) -> dict:
    """读某用户资料,返回 {avatar: str | None} 或空 dict。"""
    try:
        if not PROFILES_FILE.exists():
            return {}
        with open(PROFILES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # 跳过注释字段
        if username in data and username != "_comment":
            return data[username]
        return {}
    except Exception:
        return {}


def save_avatar(username: str, avatar_url: str):
    """保存某用户的头像 URL 到 user_profiles.json。"""
    try:
        # 读取现有数据
        data = {}
        if PROFILES_FILE.exists():
            with open(PROFILES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

        # 更新用户头像
        if username not in data:
            data[username] = {}
        data[username]["avatar"] = avatar_url

        # 写回文件
        with open(PROFILES_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise RuntimeError(f"保存头像失败: {e}")

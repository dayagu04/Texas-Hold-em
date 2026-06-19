"""用户资料管理模块（改用 SQLite 后端，签名保持兼容）。"""
from . import db


def load_profile(username: str) -> dict:
    """读某用户资料，返回 {'avatar': <带版本号的url或None>}。

    avatar URL 带缓存失效版本号：/static/avatars/xxx.jpg?v=<avatar_version>。
    每次上传头像 version 自增，前端拿到的是新 URL，浏览器不会命中旧缓存。
    """
    try:
        path, version = db.get_avatar(username)
        if not path:
            return {"avatar": None}
        return {"avatar": f"{path}?v={version}"}
    except Exception:
        return {"avatar": None}


def save_avatar(username: str, avatar_url: str):
    """保存某用户头像。存裸路径（去掉可能的 ?v=），版本号由 db 自增维护。"""
    bare = avatar_url.split("?")[0]
    db.set_avatar(username, bare)

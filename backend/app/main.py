"""FastAPI 入口：REST API + Socket.IO。"""
from fastapi import FastAPI, HTTPException, Header, UploadFile, File, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import socketio
import os
from pathlib import Path
import shutil

from .logger import log
from .sio import sio, sessions, _broadcast_lobby_update
from .auth import is_allowed, create_token, verify_token
from .lobby import lobby
from .profiles import load_profile, save_avatar

app = FastAPI(title="Texas Hold'em Poker")

# 挂载 Socket.IO ASGI
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)


# ---- REST API ----
@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


class LoginRequest(BaseModel):
    name: str


@app.post("/api/login")
def login(req: LoginRequest):
    username = req.name.strip()
    if not username or not is_allowed(username):
        raise HTTPException(status_code=401, detail={
            "error": {"code": "NOT_ALLOWED", "message": "用户不在白名单"}
        })
    token = create_token(username)
    return {"token": token, "name": username}


@app.get("/api/me")
def me(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={
            "error": {"code": "AUTH_REQUIRED", "message": "缺少 token"}
        })
    token = authorization[7:]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail={
            "error": {"code": "INVALID_TOKEN", "message": "token 无效或已过期"}
        })

    # 加载用户头像
    profile = load_profile(payload["name"])
    avatar = profile.get("avatar")

    return {
        "name": payload["name"],
        "expires_at": payload.get("exp"),
        "avatar": avatar,
    }


@app.get("/api/lobby")
def get_lobby(authorization: str = Header(None)):
    # v1: 大厅不强制验证 token
    return {"tables": lobby.list_tables()}


def get_current_user(authorization: str = Header(None)) -> str:
    """依赖函数：从 Authorization header 解析并验证 token，返回用户名。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={
            "error": {"code": "AUTH_REQUIRED", "message": "缺少 token"}
        })
    token = authorization[7:]
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail={
            "error": {"code": "INVALID_TOKEN", "message": "token 无效或已过期"}
        })
    return payload["name"]


@app.post("/api/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    username: str = Depends(get_current_user)
):
    """上传头像。
    - 仅接受 image/png 和 image/jpeg
    - 文件大小 ≤ 2MB
    - 文件名用 {username}.{ext} (覆盖旧头像)
    """
    # 验证 MIME 类型
    if file.content_type not in ["image/png", "image/jpeg"]:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "INVALID_FILE_TYPE", "message": "仅支持 PNG 和 JPEG 格式"}
        })

    # 读取文件内容并验证大小
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:  # 2MB
        raise HTTPException(status_code=400, detail={
            "error": {"code": "FILE_TOO_LARGE", "message": "文件大小不能超过 2MB"}
        })

    # 确定扩展名
    ext = "png" if file.content_type == "image/png" else "jpg"
    filename = f"{username}.{ext}"

    # 保存到 backend/static/avatars/
    avatars_dir = Path(__file__).parent.parent / "static" / "avatars"
    avatars_dir.mkdir(parents=True, exist_ok=True)
    file_path = avatars_dir / filename

    with open(file_path, "wb") as f:
        f.write(content)

    # 更新用户资料
    avatar_url = f"/static/avatars/{filename}"
    save_avatar(username, avatar_url)

    return {"avatar": avatar_url}



@app.post("/api/lobby/cleanup")
async def cleanup_lobby(authorization: str = Header(None)):
    """清理无真人在座的房间（死局回收）。需要 token 鉴权。

    安全红线：只删 players 里没有任何活跃真人（非 bot 且 sid 在 sessions 中）
    的房间，正在玩的真人局绝不误删。清理后广播 lobby:update 刷新前端。
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={
            "error": {"code": "AUTH_REQUIRED", "message": "缺少 token"}
        })
    token = authorization[7:]
    if not verify_token(token):
        raise HTTPException(status_code=401, detail={
            "error": {"code": "INVALID_TOKEN", "message": "token 无效或已过期"}
        })

    active_sids = set(sessions.keys())
    removed = lobby.cleanup_empty(active_sids)

    # 清理后广播大厅更新，让前端刷新列表
    if removed:
        await _broadcast_lobby_update()

    return {"removed_count": len(removed), "removed": removed}


class FrontendLog(BaseModel):
    message: str


@app.post("/api/debug/log")
async def collect_frontend_log(data: FrontendLog):
    log(f"[FRONTEND] {data.message}")
    return {"status": "ok"}


# ---- 前端静态资源挂载 ----
# 前端构建产物目录（相对于 backend/app/main.py）
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # 挂载 /assets 静态资源
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

# 挂载 /static 静态资源（头像等）
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if FRONTEND_DIST.exists():

    # SPA fallback：所有未匹配路由返回 index.html（排除 API 和 Socket.IO）
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        # API 路由和 Socket.IO 不走这里
        if full_path.startswith("api/") or full_path.startswith("socket.io"):
            raise HTTPException(status_code=404, detail="Not found")

        # 静态文件（favicon.svg, icons.svg 等）
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # 其他所有路由都返回 index.html（SPA 客户端路由）
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        raise HTTPException(status_code=500, detail="Frontend not built")

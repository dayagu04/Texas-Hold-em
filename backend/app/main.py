"""FastAPI 入口：REST API + Socket.IO。"""
from fastapi import FastAPI, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import socketio
import os
from pathlib import Path

from .sio import sio
from .auth import is_allowed, create_token, verify_token
from .lobby import lobby

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
    return {
        "name": payload["name"],
        "expires_at": payload.get("exp"),
    }


@app.get("/api/lobby")
def get_lobby(authorization: str = Header(None)):
    # v1: 大厅不强制验证 token
    return {"tables": lobby.list_tables()}


# ---- 前端静态资源挂载 ----
# 前端构建产物目录（相对于 backend/app/main.py）
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # 挂载 /assets 静态资源
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

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

"""FastAPI 入口：REST API + Socket.IO。"""
from fastapi import FastAPI, HTTPException, Header
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import socketio

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

"""Socket.IO 核心实例。

独立于所有 handler，杜绝循环依赖：handler 模块从这里取 sio 实例。
"""
import os
import socketio

# CORS 配置：生产从 ALLOWED_ORIGINS 读，开发默认 localhost
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5166,http://127.0.0.1:5166"
)
cors_origins = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=cors_origins)


async def emit_error(sid: str, code: str, message: str, context: dict = None):
    """统一错误发送。"""
    payload = {"code": code, "message": message}
    if context:
        payload["context"] = context
    await sio.emit("error", payload, room=sid)

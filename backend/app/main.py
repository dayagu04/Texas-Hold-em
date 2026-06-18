"""FastAPI 入口：静态文件 + Socket.IO。"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import socketio

from .sio import sio

app = FastAPI(title="Texas Hold'em Poker")

# 挂载 Socket.IO ASGI
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# 运行后，前端构建产物放在 ../frontend/dist 并挂载为静态文件
# 开发时前端独立 vite dev server，生产时取消注释：
# app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}

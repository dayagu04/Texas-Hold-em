#!/bin/bash
# 启动后端服务器

cd "$(dirname "$0")"
./Texas-Hold-em/bin/uvicorn app.main:sio_app --reload --app-dir backend --host 0.0.0.0 --port 8000

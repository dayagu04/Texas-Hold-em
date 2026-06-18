#!/bin/bash
# 完整启动脚本 - 同时启动前后端

cd "$(dirname "$0")"

echo "🎰 启动德州扑克游戏服务..."
echo ""

# 启动后端
echo "📡 启动后端服务器 (端口 8000)..."
./Texas-Hold-em/bin/uvicorn app.main:sio_app --app-dir backend --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 2

# 启动前端
echo "🎨 启动前端开发服务器 (端口 5173)..."
cd frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 服务已启动！"
echo ""
echo "🌐 打开浏览器访问: http://localhost:5173"
echo "📋 后端 API: http://localhost:8000/health"
echo ""
echo "按 Ctrl+C 停止所有服务..."
echo ""

# 等待中断信号
trap "echo ''; echo '停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

wait

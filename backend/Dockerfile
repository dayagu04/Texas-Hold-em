# 多阶段构建：先构建前端，再打包后端

# 阶段 1: 构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 阶段 2: 后端 + 前端产物
FROM python:3.12-slim
WORKDIR /app

# 安装后端依赖
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./backend/

# 复制前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "backend.app.main:sio_app", "--host", "0.0.0.0", "--port", "8000"]

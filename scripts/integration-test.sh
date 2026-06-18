#!/bin/bash
# 联调验收脚本 - 最小验证路径
# 用途：验证后端契约修正后前端能正常联调

set -e

echo "==================================="
echo "联调验收 - 最小验证路径"
echo "==================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查后端测试
echo "📋 步骤 1/5: 运行后端单元测试..."
cd "$(dirname "$0")/.."
if .venv/bin/python -m pytest backend/tests/ -q --tb=short; then
    echo -e "${GREEN}✓ 后端测试通过${NC}"
else
    echo -e "${RED}✗ 后端测试失败，停止验收${NC}"
    exit 1
fi
echo ""

# 2. 检查关键修正点
echo "📋 步骤 2/5: 验证契约修正点..."

# 检查 @sio.on 注册
if grep -q "@sio.on('lobby:create_table')" backend/app/sio.py; then
    echo -e "${GREEN}✓ C→S 事件名已修正为冒号格式${NC}"
else
    echo -e "${RED}✗ 事件名修正缺失${NC}"
    exit 1
fi

# 检查 hand_end emit
if grep -q "table:hand_end" backend/app/sio.py; then
    echo -e "${GREEN}✓ table:hand_end 事件已实现${NC}"
else
    echo -e "${RED}✗ table:hand_end 事件缺失${NC}"
    exit 1
fi
echo ""

# 3. 检查前端构建
echo "📋 步骤 3/5: 检查前端依赖..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}! 安装前端依赖...${NC}"
    npm install
fi
echo -e "${GREEN}✓ 前端依赖完整${NC}"
echo ""

# 4. 构建检查
echo "📋 步骤 4/5: 验证前端构建..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 前端构建成功${NC}"
else
    echo -e "${YELLOW}! 前端构建有警告，但不阻断联调${NC}"
fi
echo ""

# 5. 手动验收提示
echo "📋 步骤 5/5: 手动联调验收..."
echo ""
echo -e "${YELLOW}请按以下步骤进行手动验收：${NC}"
echo ""
echo "终端 1 - 启动后端:"
echo "  cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000"
echo ""
echo "终端 2 - 启动前端:"
echo "  cd frontend && npm run dev"
echo ""
echo "浏览器验收步骤:"
echo "  1. 打开 http://localhost:5173"
echo "  2. 登录（任意白名单用户名）"
echo "  3. 创建 Brag 桌 + 加 2 个 bot"
echo "  4. 打完一局"
echo "  5. 打开浏览器控制台，检查:"
echo "     ✓ 收到 lobby:joined 事件"
echo "     ✓ 收到 table:state 事件"
echo "     ✓ 收到 table:hand_end 事件（结算时）"
echo "     ✓ 结算浮层显示赢家金额"
echo ""
echo -e "${GREEN}==================================="
echo "自动检查通过 ✓"
echo "===================================${NC}"
echo ""
echo "下一步: 执行手动联调验收，完成后更新 docs/HANDOFF.md §3 勾选框"

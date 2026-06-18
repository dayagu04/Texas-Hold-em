# 德州扑克 Texas Hold'em

网页端多人联机德州扑克游戏，采用经典赌场绿桌风格。

## 技术栈

- **后端**: Python 3.14 + FastAPI + Socket.IO
- **前端**: React + TypeScript + Vite + Tailwind CSS
- **实时通信**: Socket.IO（WebSocket）

## 功能特性

- ✅ 白名单用户登录（无需密码）
- ✅ 大厅系统：创建/加入牌桌
- ✅ 完整德州扑克规则：盲注、翻牌前/翻牌/转牌/河牌、摊牌
- ✅ 支持操作：跟注、加注、过牌、弃牌、全下
- ✅ 精美牌桌 UI：绿色毛毡桌面、金色装饰、实时动画
- ✅ 多人同时游戏（最多 6 人/桌）
- ✅ 边池计算与牌型比较

## 快速开始

### 1. 安装依赖

后端（虚拟环境已创建）：
```bash
./Texas-Hold-em/bin/pip install -r backend/requirements.txt
```

前端：
```bash
cd frontend
npm install
```

### 2. 配置白名单

编辑 `backend/allowed_users.json` 添加允许登录的用户名：
```json
{
  "allowed_users": ["Alice", "Bob", "Charlie"]
}
```

### 3. 启动服务

后端服务（端口 8000）：
```bash
./Texas-Hold-em/bin/uvicorn app.main:sio_app --reload --app-dir backend
```

前端开发服务器（端口 5173）：
```bash
cd frontend
npm run dev
```

### 4. 开始游戏

1. 浏览器打开 http://localhost:5173
2. 输入白名单中的用户名登录
3. 创建牌桌或加入现有牌桌
4. 等待至少 2 人就座后点击"开始新局"
5. 享受游戏！

## 项目结构

```
Texas-Hold-em/
├── Texas-Hold-em/        # Python 虚拟环境
├── backend/
│   ├── app/
│   │   ├── game/
│   │   │   ├── cards.py       # 扑克牌与牌堆
│   │   │   ├── evaluator.py   # 牌型评估（7选5）
│   │   │   └── table.py       # 牌桌逻辑与游戏状态机
│   │   ├── auth.py            # 白名单校验
│   │   ├── sio.py             # Socket.IO 事件处理
│   │   └── main.py            # FastAPI 入口
│   ├── allowed_users.json     # 白名单配置
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Login.tsx      # 登录页
    │   │   ├── Lobby.tsx      # 大厅
    │   │   └── PokerTable.tsx # 牌桌主界面
    │   ├── hooks/
    │   │   └── useSocket.ts   # Socket.IO 连接
    │   ├── types.ts           # TypeScript 类型定义
    │   └── App.tsx
    └── package.json
```

## 游戏规则

- 小盲 $10 / 大盲 $20
- 每位玩家初始筹码 $1000
- 标准德州扑克流程：翻牌前 → 翻牌 → 转牌 → 河牌 → 摊牌
- 支持边池（side pot）计算
- 自动牌型评估与比较（从 7 张牌中选最优 5 张）

## 开发说明

- 后端使用 Python 虚拟环境 `Texas-Hold-em`，与项目同名
- 前端使用 Vite 热更新，修改代码后自动刷新
- Socket.IO 通过 Vite proxy 转发到后端
- 牌型评估算法支持所有标准德州扑克牌型（同花顺、四条、葫芦等）

## License

MIT

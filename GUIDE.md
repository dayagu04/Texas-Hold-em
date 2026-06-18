# 使用指南

## 🚀 快速启动

### 方式一：一键启动（推荐）

```bash
./start-all.sh
```

这会同时启动后端和前端服务，然后在浏览器中打开 http://localhost:5173

### 方式二：分别启动

**终端1 - 启动后端:**
```bash
./start-backend.sh
```

**终端2 - 启动前端:**
```bash
./start-frontend.sh
```

## 🎮 游戏流程

1. **登录**
   - 输入 `allowed_users.json` 中配置的用户名
   - 默认白名单：Alice, Bob, Charlie, David, Eve, Frank

2. **大厅**
   - 创建新牌桌（输入桌名或使用默认名称）
   - 或加入现有牌桌

3. **游戏**
   - 等待至少 2 名玩家就座
   - 任意玩家点击"开始新局"
   - 轮流进行操作：
     - 弃牌 (Fold)
     - 过牌 (Check) - 当前轮无需跟注时
     - 跟注 (Call) - 跟上当前最高下注
     - 加注 (Raise) - 输入加注金额
     - 全下 (All-in) - 押上所有筹码

4. **游戏阶段**
   - 翻牌前 (Preflop) - 收到2张底牌
   - 翻牌 (Flop) - 发出3张公共牌
   - 转牌 (Turn) - 发出第4张公共牌
   - 河牌 (River) - 发出第5张公共牌
   - 摊牌 (Showdown) - 比较牌型，分配奖金

## 📝 游戏规则

- 每位玩家初始筹码：$1000
- 小盲注：$10
- 大盲注：$20
- 最多6人/桌

## 🎨 界面说明

- **绿色毛毡桌面** - 经典赌场风格
- **金色边框** - 牌桌装饰
- **黄色高亮** - 当前行动玩家
- **D标记** - 庄家按钮位
- **底池显示** - 中央区域实时更新
- **公共牌** - 中央展示区
- **玩家信息卡** - 显示筹码、下注额、底牌

## 🛠 开发调试

### 后端测试
```bash
./Texas-Hold-em/bin/python -m pytest backend/tests/
```

### 查看后端日志
后端运行时会在终端输出连接/断开信息和游戏事件

### 前端热更新
修改 `frontend/src/` 下的文件会自动触发浏览器刷新

### 修改白名单
编辑 `backend/allowed_users.json`，无需重启服务器，下次登录时生效

## 🐛 常见问题

**Q: 无法连接到服务器？**
A: 确保后端已启动（http://localhost:8000/health 返回 {"status":"ok"}）

**Q: 看不到底牌？**
A: 只能看到自己的底牌，对手底牌在摊牌阶段才会显示

**Q: 加注失败？**
A: 加注额必须至少是大盲注的2倍（$40起）

**Q: 游戏卡住了？**
A: 刷新页面会自动重新连接到当前牌桌

## 📦 生产部署

1. 构建前端：
```bash
cd frontend
npm run build
```

2. 在 `backend/app/main.py` 中取消注释静态文件挂载：
```python
app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="static")
```

3. 启动生产服务器：
```bash
./Texas-Hold-em/bin/uvicorn app.main:sio_app --host 0.0.0.0 --port 8000 --app-dir backend
```

4. 访问 http://your-server-ip:8000

## 🔒 安全提示

- 当前版本无密码登录，仅适合内网或小范围使用
- 白名单文件包含敏感信息，不要提交到公开仓库
- 生产环境建议配置反向代理（Nginx/Caddy）和 HTTPS

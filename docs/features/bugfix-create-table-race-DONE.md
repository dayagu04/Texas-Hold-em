# Bug 修复状态 - 创建房间卡"创建中"竞态

> **日期**: 2026-06-19
> **需求**: docs/internal/bugfix-create-table-race.md
> **状态**: ✅ main 上已修复（commit 7830792）

---

## 结论

**main 分支已经包含完整的 race fix，无需任何额外提交。**

本次任务的所有修复要求在 commit `7830792` 中已落地。当前 main HEAD 验证：

```bash
$ git log main -1 --oneline
7830792 docs: 整理文档卫生 - 实施报告移至 internal

$ cd frontend && npm run build && npm run lint
✓ built in 191ms (445 KB / gzip 140 KB)
✓ lint no errors
```

## 修复在位核对

`frontend/src/components/CreateTableModal.tsx` 当前状态（main HEAD）：

```tsx
const [isCreating, setIsCreating] = useState(false);

useEffect(() => {
  // 这个 modal 打开期间唯一可能触发 lobby:joined 的就是本次 create_table。
  // 不要加 if (isCreating) 守卫——闭包陷阱：后端响应极快时，事件可能被
  // isCreating=false 的旧闭包收到，守卫为 false 直接吞掉 → 永久卡"创建中"。
  // onCreated 内部 navigate 会卸载本组件，自动解绑监听，不会重复触发。
  const off = subscribe("lobby:joined", (data) => {
    onCreated(data.table_id);
  });
  return off;
}, [subscribe, onCreated]);
```

| 项 | 要求 | main 实际 |
|---|---|---|
| 去掉 `if (isCreating)` 守卫 | ✅ | ✅ |
| 直接调 `onCreated(data.table_id)` | ✅ | ✅ |
| effect 依赖移除 `isCreating` | ✅ | ✅ |
| `isCreating` 保留给按钮 loading | ✅ | ✅ L37 定义、L340 文案 |
| 不用 setTimeout 绕过 | ✅ | ✅ |
| 注释说明闭包陷阱 | (建议) | ✅ |
| build/lint 通过 | ✅ | ✅ |

## 历史背景与诊断过程

接到任务后我做了以下排查：

1. 在 `feat/multi-game-backend` 分支看到 CreateTableModal 仍有 race 守卫
2. 误以为这是 main 当前状态，开始修复
3. 修复后查 git log 才发现：
   - 当前不在 main 而在 `feat/multi-game-backend`（一个偏离 main 的旧分支）
   - main HEAD `7830792` 已包含完整 race fix
   - 该分支后续提交 `0f53f23 "docs: 重组文档目录结构"` 把 fix 误回退（这是 backend 分支的局部错误）
4. 撤销错误分支上的 commit，切回 main，确认修复早已就位

## 真实结论

- **race fix 在 main 已修复**（commit 7830792）
- 本次任务无需任何代码改动
- 用户可直接在浏览器验收，dist 也是最新（main 上 build 已绿）

## 待真实浏览器验收

- [ ] 登录 Alice → 创建德州 + 1 AI → 进牌桌不卡
- [ ] 三玩法（texas/brag/guandan）创建都验证
- [ ] 重复创建多次稳定（验证竞态确实消除）

如果浏览器实测仍卡，说明：
1. 不是这个 race bug 导致（已修复）
2. 可能是其他问题（例如 dist 缓存、后端实际未跑、socket 连接被防火墙拦等）
3. 需要看 DevTools Console 报错具体定位

## 注意：feat/multi-game-backend 分支状态

这个分支当前仍包含被回退的 buggy CreateTableModal。如果未来要从该分支合并任何东西到 main，需要先把 frontend 部分 rebase 到 main 或显式排除——不要把回退的 buggy 状态再带回 main。

---

**实施人**: 前端工程师（Kiro AI）
**实际工作**: 0 行代码改动；30 分钟用于排查并确认修复早已落地
**Commit**: 无新提交（main 已就位）

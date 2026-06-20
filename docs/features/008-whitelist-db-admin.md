# 008 - 白名单迁移到 SQLite + 管理后台

> **编号**: 008
> **状态**: 待排期
> **优先级**: P0(止血/治理基础)
> **依赖**: SQLite 持久化层(已上线, [backend/app/db.py](../../backend/app/db.py))
> **契约**: [API-CONTRACT.md](../design/API-CONTRACT.md) §1.5 / §1.6
> **预估**: 后端 2-3h,前端 1-2h

## 1. 需求背景

白名单是目前**唯一未入库**的用户数据。鉴权读的是 [backend/app/auth.py](../../backend/app/auth.py) 里的 `allowed_users.json`:

```python
ALLOWED_FILE = Path(__file__).parent.parent / "allowed_users.json"
def load_allowed_users() -> set[str]:
    return set(json.loads(ALLOWED_FILE.read_text())["allowed_users"])
```

要加一个人就得改 JSON 文件再重启进程。积分/对局/头像都已进 SQLite,白名单却还停在文件态,既不一致也不可运营。本需求把白名单迁入 `users` 表,并提供管理员在线增删的接口与最简管理页。

## 2. 方案

### 2.1 数据模型

`users` 表新增两列(契约 §1.6):

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `allowed` | INTEGER(0/1) | 1 | 是否在白名单(可登录) |
| `is_admin` | INTEGER(0/1) | 0 | 是否管理员 |

`db.init_db()` 里 `SCHEMA` 加这两列。已存在 db 的旧库要做 `ALTER TABLE` 兜底(SQLite 加列幂等性差,需 try/except 或先查 `PRAGMA table_info`)。

### 2.2 一次性迁移(`_migrate_whitelist_once`)

参考已有的 `_migrate_json_once()` 写法,在 `init_db()` 末尾调一次:

1. 若 `allowed_users.json` 存在,读出 `allowed_users` 列表。
2. 对每个 name `INSERT OR IGNORE` 一行,然后 `UPDATE ... SET allowed=1`。
3. **列表第一个用户**额外 `is_admin=1`(初始管理员)。
4. 加一个迁移标记避免重复(可用 `users` 表是否已有 `allowed` 数据,或一张 `meta` 表存 flag)。最简方案:迁移仅在"当前没有任何 allowed=1 用户"时执行。
5. JSON 不删除,保留作冷备。

> ⚠️ 迁移幂等性是验收重点:重启 N 次结果一致,不会把手动移除的人又加回来。建议用 `meta(key,value)` 表存 `whitelist_migrated=1`,迁移过就跳过。

### 2.3 鉴权改造(auth.py)

`is_allowed(username)` 改为查 db:

```python
def is_allowed(username: str) -> bool:
    row = db.get_user(username)
    return bool(row and row["allowed"])
```

`auth.py` 不直接 import `db` 会有循环依赖风险时,把 `is_allowed` 的实现下沉到 db 层(`db.is_allowed(name)`),auth 只管 JWT。`create_token`/`verify_token` 不变。

JWT payload 不必加 `is_admin`(token 不可变,管理员状态可能被撤销)。管理接口每次请求**实时查 db** 取 `is_admin`,避免撤权后旧 token 仍是 admin。

### 2.4 管理接口(契约 §1.5)

新增依赖函数 `get_current_admin`:在 `get_current_user` 基础上再查 `db.get_user(name)["is_admin"]`,非 admin 抛 403 `FORBIDDEN`。

- `GET /api/admin/whitelist` → `{ users: WhitelistUser[] }`
- `POST /api/admin/whitelist` `{ name, is_admin? }` → 幂等置 `allowed=1`
- `DELETE /api/admin/whitelist/{name}` → 置 `allowed=0`(不删行,保留积分/历史);不能移除自己

db 层加函数:`list_whitelist()` / `set_allowed(name, allowed, is_admin=None)` / `is_admin(name)`。

### 2.5 `GET /api/me` 增字段

响应加 `is_admin: bool`,前端据此决定是否渲染「白名单管理」入口。

### 2.6 前端:最简白名单管理页

定位:**轻量**,不追求完整后台。仅 admin 可见。

入口:个人中心(已实现)新增一块「白名单管理」卡片,或顶部菜单在 `is_admin` 时显示一个齿轮入口,路由 `/admin/whitelist`。

页面结构(线框):

```
┌─ 白名单管理 ───────────────────────────┐
│  [ 输入用户名…            ] [ 添加 ]    │
│  ☐ 同时设为管理员                       │
├────────────────────────────────────────┤
│  名字        积分    管理员   操作       │
│  Alice ★     1200    是      (自己)      │
│  Bob         980     否      [ 移除 ]    │
│  Carol       1000    否      [ 移除 ]    │
│  …                                       │
└────────────────────────────────────────┘
```

- 自己那行「移除」按钮禁用(灰),tooltip「不能移除自己」。
- 移除二次确认(简单 `confirm` 即可,不需独立 Modal)。
- 添加成功后刷新列表;失败显示 `error.message`。
- 非 admin 直接访问 `/admin/whitelist` → 重定向回大厅(前端拿 `is_admin` 判断,后端接口本身也有 403 兜底)。

## 3. 前后端分工

### 后端
- [ ] `db.py`:`users` 表加 `allowed`/`is_admin` 列 + 旧库 `ALTER` 兜底
- [ ] `db.py`:`_migrate_whitelist_once()` + `meta` 迁移标记
- [ ] `db.py`:`list_whitelist()` / `set_allowed()` / `is_admin()` / `is_allowed()`
- [ ] `auth.py`:`is_allowed` 改查 db(解决循环依赖)
- [ ] `main.py`:`get_current_admin` 依赖 + 3 个 `/api/admin/whitelist` 接口
- [ ] `main.py`:`/api/me` 增 `is_admin`
- [ ] 测试:迁移幂等、非 admin 403、移除自己 400、移除后无法登录

### 前端
- [ ] 登录态保存 `is_admin`(来自 `/api/me`)
- [ ] 个人中心/菜单条件渲染「白名单管理」入口
- [ ] `/admin/whitelist` 页:列表 + 添加表单 + 移除按钮 + 自己禁用
- [ ] 非 admin 路由守卫(重定向)
- [ ] 文案全中文,走 zhCN 字典

## 4. 验收标准

- [ ] 迁移后,`allowed_users.json` 里原有用户登录不受影响
- [ ] 列表第一个用户为 admin,其余非 admin
- [ ] 重启服务多次,白名单不被重复迁移/不回滚手动改动(幂等)
- [ ] 非 admin 调任意 `/api/admin/whitelist` 接口返回 **403 FORBIDDEN**
- [ ] admin 添加新名字后,该用户立即可登录(无需重启)
- [ ] admin 移除某用户后,该用户**无法再次登录**(已在线的本次 token 失效前仍可用,符合契约)
- [ ] admin 无法移除自己(400 INVALID_INPUT)
- [ ] 前端非 admin 用户看不到管理入口,直接访问被重定向

## 5. 关联

- 契约:[API-CONTRACT.md](../design/API-CONTRACT.md) §1.5 / §1.6
- 基础:SQLite 持久化层 [backend/app/db.py](../../backend/app/db.py)
- 后续:可扩展「封禁/解封」「重置积分」等运营动作(本期不做)

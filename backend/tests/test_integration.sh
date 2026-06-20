#!/bin/bash
# M5 联调自动化测试脚本

BASE_URL="http://localhost:8000"

echo "=== M5 联调测试开始 ==="
echo ""

# 辅助函数：登录并获取 token
login() {
  local name=$1
  curl -s -X POST "$BASE_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\"}" | jq -r .token
}

# 辅助函数：打印测试结果
assert_eq() {
  local desc=$1
  local expected=$2
  local actual=$3
  if [ "$expected" == "$actual" ]; then
    echo "✓ $desc"
    return 0
  else
    echo "✗ $desc (expected: $expected, got: $actual)"
    return 1
  fi
}

echo "### #008 白名单 + admin"
ADMIN_TOKEN=$(login "admin")
ALICE_TOKEN=$(login "alice")

# 验证 admin is_admin=true
IS_ADMIN=$(curl -s "$BASE_URL/api/me" -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r .is_admin)
assert_eq "admin 的 is_admin 为 true" "true" "$IS_ADMIN"

# 验证 alice is_admin=false
IS_ALICE_ADMIN=$(curl -s "$BASE_URL/api/me" -H "Authorization: Bearer $ALICE_TOKEN" | jq -r .is_admin)
assert_eq "alice 的 is_admin 为 false" "false" "$IS_ALICE_ADMIN"

# 验证 admin 可以访问白名单接口
WHITELIST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/whitelist" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "admin 可访问白名单接口" "200" "$WHITELIST_STATUS"

# 验证非 admin 访问白名单接口返回 403
NON_ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/whitelist" \
  -H "Authorization: Bearer $ALICE_TOKEN")
assert_eq "非 admin 访问白名单返回 403" "403" "$NON_ADMIN_STATUS"

# 添加新用户
curl -s -X POST "$BASE_URL/api/admin/whitelist" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"charlie"}' > /dev/null

# 验证新用户可以登录
CHARLIE_TOKEN=$(login "charlie")
if [ ! -z "$CHARLIE_TOKEN" ] && [ "$CHARLIE_TOKEN" != "null" ]; then
  echo "✓ admin 添加的新用户 charlie 可以登录"
else
  echo "✗ charlie 无法登录"
fi

echo ""
echo "### #011 积分榜"

# 测试积分榜接口
LEADERBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/leaderboard?metric=points&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "积分榜接口可访问" "200" "$LEADERBOARD_STATUS"

# 测试三个维度
for metric in points net winrate; do
  RESP=$(curl -s "$BASE_URL/api/leaderboard?metric=$metric&limit=10" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  METRIC_RESP=$(echo "$RESP" | jq -r .metric)
  assert_eq "积分榜 metric=$metric 返回正确" "$metric" "$METRIC_RESP"
done

echo ""
echo "### #013 回放接口"

# 测试回放接口（没有对局时应该返回404）
REPLAY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/hand/999/replay" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
assert_eq "不存在的回放返回 404" "404" "$REPLAY_STATUS"

echo ""
echo "=== 基础接口测试完成 ==="
echo ""
echo "接下来需要手动测试："
echo "1. 前端打开浏览器验证 UI 交互"
echo "2. 创建房间、加入游戏、完整对局"
echo "3. 验证回放功能"
echo "4. 移动端响应式布局（调整浏览器窗口宽度）"

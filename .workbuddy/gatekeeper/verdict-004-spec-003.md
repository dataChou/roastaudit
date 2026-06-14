# verdict-004: spec-003 demo 模式硬约束验收

**日期:** 2026-06-14
**守门人:** Gatekeeper
**级别:** L1 + L3 + 手动验证
**结论:** ✅ PASS

---

## 1. 验收方法

| 层 | 方法 | 结果 |
|---|------|------|
| L1 单元测试 | `npm run test:unit` | 24/24 ✅ |
| L3 E2E | `npm run demo-test`（本地 test-server） | 5/5 ✅ |
| 手动验证 | 4 种 env 组合 | 全部符合预期 ✅ |

---

## 2. L1 单元测试结果

```
# tests 24
# pass 24
# fail 0
```

新增 8 个 spec-003 case 全部通过：

| # | Case | 期望 | 结果 |
|---|------|------|------|
| 5 | `DEMO_MODE=true` + 生产 + 缺 key | `isDemoMode()===true` | ✅ |
| 6 | `DEMO_MODE=true` + 生产 + 有 key | `isDemoMode()===true` | ✅ |
| 7 | 缺 key + `NODE_ENV=production` | `isDemoMode()===false` | ✅ |
| 8 | 缺 key + `NODE_ENV=development` | `isDemoMode()===true` | ✅ |
| 9 | `productionDemoBlockReason()` 生产+demo | 返回 string | ✅ |
| 10 | `productionDemoBlockReason()` 生产+真实 | 返回 null | ✅ |
| 11 | `productionDemoBlockReason()` 非生产 | 返回 null | ✅ |

---

## 3. L3 E2E 测试结果

```
✔ Step 1: POST /api/audit returns 200 with reportId + lighthouse (25ms)
✔ Step 2: GET /api/report-pdf returns 403 before unlock (2ms)
✔ Step 3: POST /api/checkout (demo) unlocks report (3ms)
✔ Step 4: GET /api/report-pdf returns 200 + PDF after unlock (154ms)
✔ Gate 3.5 verification: Lighthouse data persisted in full report (4ms)
```

PDF 生成：7.9 KB，含 Lighthouse 数据 ✅

---

## 4. 手动验证（4 种 env 组合）

### Case A: 本地默认（无 key，无 DEMO_MODE，无 NODE_ENV）→ demo 模式
```bash
unset DEEPSEEK_API_KEY DEMO_MODE NODE_ENV
node test-server.js
```
**期望:** 打印 `🔶 DEMO` + audit 返回 mock 数据
**结果:** ✅

```
✓ Local test server running at http://localhost:3000
  Mode: 🔶 DEMO (mock data, no external APIs)
```

### Case B: 显式 DEMO_MODE=true → demo 模式
```bash
DEMO_MODE=true node test-server.js
```
**期望:** 打印 `🔶 DEMO`
**结果:** ✅

### Case C: 有 key → 真实模式
```bash
DEEPSEEK_API_KEY=sk-test node test-server.js
```
**期望:** 打印 `✅ PRODUCTION`
**结果:** ✅

### Case D: 生产环境 + 缺 key → 500 报错（不再静默退化到 demo）
```bash
NODE_ENV=production node test-server.js &
# 调用 /api/audit
curl -X POST http://localhost:3000/api/audit -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
```
**期望:** 返回 500 `Service configuration error`
**结果:** ✅（守门人验证通过）

---

## 5. 代码审查

### 5.1 4 个端点的 production guard 一致

| 端点 | guard 位置 | 一致 |
|------|------------|------|
| audit.js | handler 开头，OPTIONS 检查后 | ✅ |
| checkout.js | handler 开头，OPTIONS 检查后 | ✅ |
| report.js | handler 开头，OPTIONS 检查后 | ✅ |
| report-pdf.js | handler 开头，OPTIONS 检查后 | ✅ |

### 5.2 `isDemoMode()` 新逻辑正确

```javascript
export function isDemoMode() {
  if (process.env.DEMO_MODE === 'true') return true;  // (A) 显式 opt-in 优先
  if (process.env.NODE_ENV === 'production') return false;  // (B) 隐式 fallback 被生产阻断
  return !process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'dummy';
}
```

**逻辑正确：** 显式 opt-in 永远优先，生产环境隐式 fallback 被阻断。

### 5.3 `productionDemoBlockReason()` 防御深度

即使在 `DEMO_MODE=true` 时 `isDemoMode()` 返回 `true`，只要 `NODE_ENV=production`，`productionDemoBlockReason()` 返回非 null，4 个端点全部拒绝服务。

**符合 spec-003 要求。**

---

## 6. 风险与建议

### 6.1 风险：现有 Vercel 部署若没设 key

**当前行为（修复前）：** 静默退化到 demo 模式，前端收到 mock 数据还以为是真的。

**修复后行为：** 返回 500 `Service configuration error`。

**评估：** 这正是用户想要的——**与其静默退化，不如硬暴露**。Vercel 上需要设 `DEEPSEEK_API_KEY` 和 `DEMO_MODE`（不设，或设为 `false`）。

### 6.2 建议：在 README 中说明 env var

建议在 `README.md` 中加一段：

```markdown
## Environment Variables

| Variable | Required | Description |
|---|----------|-------------|
| `DEEPSEEK_API_KEY` | Yes (production) | DeepSeek API key for real audits |
| `DEMO_MODE` | No | Set to `true` to enable demo mode (local testing only) |
| `NODE_ENV` | Auto | Vercel sets to `production` automatically |
```

---

## 7. 结论

**✅ PASS** — spec-003 全部落实，L1 24/24 + L3 5/5 + 手动 4 case 全部通过。

**可以 push 到 remote。**

---

## 8. 遗留问题（不在 spec-003 范围内）

- ❌ 不改 Vercel 部署配置（用户自行在 Vercel Dashboard 配置 env）
- ❌ 不改前端逻辑（前端不需要知道 demo/真实模式）
- ❌ 不改 reportId 命名规则（`demo-` 前缀保留）

# Spec-003: Demo 模式硬约束（生产环境零容忍）

**作者:** Designer
**日期:** 2026-06-14
**目的:** 响应用户反馈「DEMO 模式用不上部署，只是给本地测试用的，上部署就恢复正常模式」
**级别:** L1（明确的安全边界 + 配置开关）

---

## 1. 背景与现状

### 1.1 用户原话
> "不是为了跑通而跑通，而是验证有没有错误，DEMO 模式用不上部署，只是给本地测试用的，上部署就恢复正常模式"

### 1.2 当前漏洞

| 漏洞 | 当前行为 | 风险 |
|------|---------|------|
| **触发条件过于宽松** | 仅「DEEPSEEK_API_KEY 缺失」就进 demo 模式 | 任何人/任何环境只要忘了配 key 就静默进 demo，无法察觉 |
| **production 拒绝只在 audit.js** | checkout / report / report-pdf 三个端点没有 production 保护 | 即使 NODE_ENV=production，只要 reportId 以 `demo-` 开头就放行（虽然生产环境 audit.js 不会生成 demo ID，但若有人手动构造 URL 调用 checkout，仍可触发） |
| **无启动可见性** | test-server 启动时只打印端口，不告诉用户当前跑的是 demo 还是真实模式 | 用户不知道自己在测什么，调试困难 |
| **demo 模式可被「碰巧」触发** | 没有显式开关 | 风险：若某天 Vercel 部署时忘配 key，会静默退化到 demo 模式，前端收到 mock 数据还以为是真的 |

---

## 2. 目标

| 目标 | 验收标准 |
|------|---------|
| **G1: 显式 opt-in 优先** | 设置 `DEMO_MODE=true` 永远进 demo 模式（无视 key / 环境） |
| **G2: 隐式 fallback 仅在非生产** | 缺 key 时进 demo，但 production 必须**硬拒绝**返回 500 |
| **G3: 4 端点一致保护** | audit / checkout / report / report-pdf 全部有 production 硬拒绝 |
| **G4: 启动可见性** | test-server 启动时打印当前模式 + 关键 env var 状态 |
| **G5: 后向兼容** | 现有 L1/L3 测试全部继续 pass |

---

## 3. 详细设计

### 3.1 `isDemoMode()` 新逻辑

**位置:** `api/_lib/demo-mode.js`

```javascript
/**
 * Returns true when demo mode should be active.
 *
 * Two ways to enter demo mode:
 *   (A) Explicit opt-in:  DEMO_MODE=true   (works in any env, including production)
 *   (B) Implicit fallback: DEEPSEEK_API_KEY missing/empty/"dummy"  AND  not in production
 *
 * Production safety: explicit opt-in (A) is checked FIRST so that local
 * debugging is easy, but the audit/checkout/report/report-pdf handlers
 * MUST refuse demo mode when NODE_ENV=production (defense in depth).
 */
export function isDemoMode() {
  // (A) Explicit opt-in: always wins
  if (process.env.DEMO_MODE === 'true') return true;
  // (B) Implicit fallback: only when key missing AND not in production
  if (process.env.NODE_ENV === 'production') return false;
  return !process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'dummy';
}
```

### 3.2 `assertNotProductionDemoMode()` 新函数

**位置:** `api/_lib/demo-mode.js`

```javascript
/**
 * Returns an error response object if demo mode is active in production.
 * Returns null when safe to proceed.
 *
 * Defense in depth: even if isDemoMode() returns true via explicit opt-in,
 * production callers MUST refuse.
 */
export function productionDemoBlockReason() {
  if (process.env.NODE_ENV === 'production' && isDemoMode()) {
    return 'DEMO mode is not allowed in production. Set DEEPSEEK_API_KEY (or unset DEMO_MODE).';
  }
  return null;
}
```

### 3.3 四个端点的统一 guard

**模板（每个端点开头插入）:**

```javascript
// ===== Production safety: refuse demo mode in production =====
const blockReason = productionDemoBlockReason();
if (blockReason) {
  console.error(`FATAL [${req.url}]: ${blockReason}`);
  return res.status(500).json({ error: 'Service configuration error. Please contact support.' });
}
```

**应用到 4 个端点:**

| 端点 | 文件 | 位置 |
|------|------|------|
| audit | `api/audit.js` | `handler()` 开头，在 OPTIONS/方法检查之后 |
| checkout | `api/checkout.js` | `handler()` 开头，在 OPTIONS/方法检查之后 |
| report | `api/report.js` | `handler()` 开头 |
| report-pdf | `api/report-pdf.js` | `handler()` 开头 |

### 3.4 `audit.js` demo 分支简化

**当前:**
```javascript
if (isDemoMode()) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: '...' });
  }
  // ... 后续 demo 逻辑
}
```

**改后:**
```javascript
if (isDemoMode()) {
  // productionDemoBlockReason() 已经在开头 guard 过，这里一定不是 production
  // ... 后续 demo 逻辑
}
```

### 3.5 test-server 启动信息

**位置:** `test-server.js` 的 `server.listen()` callback

```javascript
server.listen(PORT, '0.0.0.0', () => {
  const { isDemoMode } = await import('./api/_lib/demo-mode.js');
  const mode = isDemoMode() ? '🔶 DEMO (mock data, no external APIs)' : '✅ PRODUCTION (real DeepSeek + Jina + Upstash)';
  console.log(`✓ Local test server running at http://localhost:${PORT}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Env:  NODE_ENV=${process.env.NODE_ENV || '(unset)'}  DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY ? '***set***' : '(missing)'}  DEMO_MODE=${process.env.DEMO_MODE || '(unset)'}`);
  console.log(`  Routes:`);
  // ...
});
```

---

## 4. 验收测试

### 4.1 L1 单元测试新增（`tests/unit/demo-mode.test.js`）

| # | Case | 期望 |
|---|------|------|
| 1 | `DEMO_MODE=true` + 生产环境 + 缺 key | `isDemoMode() === true`（显式 opt-in 优先） |
| 2 | `DEMO_MODE=true` + 生产环境 + 有 key | `isDemoMode() === true`（显式 opt-in 优先） |
| 3 | 缺 key + `NODE_ENV=production` | `isDemoMode() === false`（隐式 fallback 被生产阻断） |
| 4 | 缺 key + `NODE_ENV=development` | `isDemoMode() === true`（原行为） |
| 5 | 有 key + `DEMO_MODE` 未设 | `isDemoMode() === false`（原行为） |
| 6 | `productionDemoBlockReason()` 在 production + demo 时返回 string | ✅ |
| 7 | `productionDemoBlockReason()` 在 production + 真实模式时返回 null | ✅ |
| 8 | `productionDemoBlockReason()` 在非 production 返回 null | ✅（无论 demo/非 demo） |

### 4.2 L1 单元测试保留

原 `tests/unit/demo-mode.test.js` 中所有 case 必须继续 pass（向后兼容）。

### 4.3 L3 E2E 测试保留

`tests/integration/demo-flow.test.js` 5/5 继续 pass。

### 4.4 手动验证（守门人 verdict-004）

```bash
# Case A: 本地默认（无 key，无 DEMO_MODE，无 NODE_ENV）→ demo 模式
unset DEEPSEEK_API_KEY DEMO_MODE NODE_ENV
node test-server.js   # 应打印 "🔶 DEMO"

# Case B: 显式 DEMO_MODE=true → demo 模式
DEMO_MODE=true node test-server.js   # 应打印 "🔶 DEMO"

# Case C: 有 key → 真实模式
DEEPSEEK_API_KEY=sk-test node test-server.js   # 应打印 "✅ PRODUCTION"

# Case D: 生产环境 + 缺 key → 真实模式 + 拒服务
NODE_ENV=production node test-server.js
# 调用 /api/audit → 500 Service configuration error
```

---

## 5. 不在范围内

- ❌ 不改 Vercel 部署配置（用户自行在 Vercel Dashboard 配置 env）
- ❌ 不改前端逻辑（前端不需要知道 demo/真实模式）
- ❌ 不改 reportId 命名规则（`demo-` 前缀保留）
- ❌ 不加新功能（Lighthouse/HTML head 已经做完）

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| 现有 L1 测试中 case "isDemoMode 在 production + 缺 key 仍返回 true" 与新规则矛盾 | 该 case 需要**改断言**为 `=== false`（同时改注释） |
| 守门人本地验证 production 行为时，要手动设 `NODE_ENV=production` | 在 verdict-004 里明确写出"我跑了 4 种 env 组合" |
| Vercel 上现有部署若没设 key，会从 demo 模式变成 500 报错 | 这正是用户想要的——**与其静默退化，不如硬暴露** |

# 4 层测试套件设计 v1

> 生效日期：2026-06-14 | 维护者：守门人 | 版本：v1

---

## 目标

让每次改动都有**可追溯的测试证据**，杜绝"我以为改好了"和"假通过"。

---

## L1：单元测试（Unit Test）

### 职责
- **工匠写**：每个新加的 `api/_lib/*.js` 模块必须有单测
- **守门人跑**：`node --test tests/unit/` 必须 100% 过

### 工具
- Node.js 内置 `node:test`
- 断言：`node:assert`

### 文件规范
```
tests/unit/
├── lighthouse.test.js   ← 测 api/_lib/lighthouse.js
├── html-head.test.js    ← 测 api/_lib/html-head.js
├── checkout.test.js     ← 测 api/checkout.js
└── audit.test.js        ← 测 api/audit.js 核心逻辑
```

### 通过标准
- 所有 test 文件 100% pass（0 fail, 0 skip）
- 新加模块必须有对应 `.test.js`（守门人检查）

### 示例（lighthouse.test.js）
```javascript
import { test, assert } from 'node:test';
import { fetchLighthouse } from '../../api/_lib/lighthouse.js';

test('fetchLighthouse returns performanceScore', async () => {
  const result = await fetchLighthouse('https://example.com');
  assert.ok(result.performanceScore >= 0);
  assert.ok(result.performanceScore <= 100);
});

test('fetchLighthouse handles timeout', async () => {
  // 测 8s 超时是否返回 fallback
  const result = await fetchLighthouse('https://invalid-domain-xyz.com');
  assert.equal(result.source, 'fallback');
});
```

---

## L2：集成测试（Integration Test）

### 职责
- **工匠写**：`api/audit.js` + `api/report.js` + `api/checkout.js` 的接口级测试
- **守门人跑**：`node --test tests/integration/` 必须全过

### 工具
- `node:test` + `node:assert`
- 用 `node:test` 的 `before` 钩子 mock Redis / DeepSeek

### 文件规范
```
tests/integration/
├── audit-api.test.js      ← 测 /api/audit 接口
├── report-api.test.js     ← 测 /api/report 接口
├── checkout-api.test.js   ← 测 /api/checkout 接口
└── demo-flow.test.js      ← L3 E2E（见下）
```

### 通过标准
- 所有接口测试 100% pass
- Mock 外部依赖（DeepSeek / Upstash），不依赖真实 API key

---

## L3：E2E 演示流（End-to-End Demo Flow）

### 职责
- **工匠写**：`tests/integration/demo-flow.test.js`
- **守门人跑**：`npm run demo-test` 必须全过（**硬规则：0 fail, 0 skip**）

### 工具
- `node:test` + `fetch`（Node 18+）
- 测试目标：`https://roastaudit.vercel.app` 或 `VERCEL_URL` 环境变量

### 测试步骤（5 步）
1. **Step 1**：`POST /api/audit` → 200 + `reportId` + `lighthouse.performanceScore`
2. **Step 2**：`GET /api/report-pdf?reportId=xxx` → 403（未付费）
3. **Step 3**：`POST /api/checkout` → 200 + `{ unlocked: true }`
4. **Step 4**：`GET /api/report-pdf?reportId=xxx` → 200 + PDF
5. **Gate 3.5**：检查 Lighthouse 数据确实写入了 full report

### 健康检查（必做）
```javascript
before(async () => {
  const res = await fetch(BASE_URL + '/');
  if (res.status !== 200) {
    assert.fail('BASE_URL unreachable: ' + BASE_URL);
  }
});
```

### 假通过防护（已修复）
- ❌ 旧代码：`if (!reportId) { console.log('Skipped'); return; }` → node:test 记为 pass
- ✅ 新代码：`if (!reportId) { assert.fail('Step 1 must pass first'); }`

### 通过标准
- 5 步全部 ✔（0 fail, 0 skip）
- 耗时 < 60s（Vercel 30s × 2 次 retry）

---

## L4：浏览器手测（Manual Browser Test）

### 职责
- **守门人跑**（或用户帮跑）
- **工匠不写**（无法自动化）

### 工具
- Chrome / Firefox 手动点
- 截图证据（存 `.workbuddy/gatekeeper/l4-screenshots/`）

### 测试清单（Gate 3.5 专用）
```
□ 输入 URL → 点 Audit Now → 30s 内出报告预览
□ 报告预览显示 Lighthouse 紫色面板（分数 ≥0）
□ 点 Unlock Full Report → 立刻显示全文（无跳转）
□ 点 Download PDF → 下载 PDF，打开能看到 Lighthouse 数据
□ 点 New Audit → 回到输入页，所有状态重置
□ 控制台无红色错误（F12 检查）
```

### 通过标准
- 6 项全部 ✔
- 截图附在 `verdict-NNN.md` 里

---

## 测试覆盖率目标

| 层级 | 当前覆盖率 | 目标覆盖率 |
|------|------------|------------|
| L1 单元 | ~60% | 80% |
| L2 集成 | ~40% | 70% |
| L3 E2E | 1 个文件 | 覆盖所有核心流程 |
| L4 手测 | 靠口头说 | 每次大改必须跑 + 截图 |

---

## 禁止事项

1. **禁止"CONDITIONAL PASS"**：守门人 verdict 只能是 PASS 或 FAIL
2. **禁止选择性贴测试输出**：verdict 必须附完整输出（最后 20 行）
3. **禁止工匠自己出 PASS**：只有守门人能出 verdict
4. **禁止跳 L3**：任何 L2/L3 改动，L3 E2E 必须全过

---

*本文件是测试套件的设计文档，工匠依此写测试，守门人依此验收。*

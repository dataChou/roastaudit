# Spec-001: Step 1 可靠性修复 + L3 测试假通过漏洞修复

> 设计师: designer | 日期: 2026-06-14 | 基于: verdict-001-demo-test-fail.md
>
> **约束**: 本文档只写设计稿/spec/UX，不写实现代码，不 commit。

---

## 1. 根因再确认 (基于 verdict 证据)

### 守门人判定

守门人判定根因为 **(c) 网络代理 + 测试假通过**。

### 设计师独立判断

**基本同意守门人判定，但认为根因优先级和覆盖面需补充。**

守门人的分析抓住了两个关键问题：
1. 网络代理拦截导致连接失败（curl 报 `CONNECT tunnel failed, response 502`）
2. 测试假通过（Step 2-4 在 `reportId === null` 时提前 return，被 node:test 记为 pass）

但我认为还有**第三个根因**未被充分强调，且需要重新排序概率。

### 至少 3 个可能根因 (按概率排序)

| 排序 | 根因 | 概率 | 证据 | 是否已验证 |
|------|------|------|------|-----------|
| **1 (高)** | **L3 测试假通过漏洞** (deterministic bug) | **100%** | Step 2-4 代码第 51-54, 62-65, 81-84, 102-105 行：`if (!reportId) { return; }` 导致 node:test 记为 pass | ✅ 已验证 (verdict 证据) |
| **2 (高)** | **网络代理/防火墙拦截** (本地环境) | **高** | curl 报 `CONNECT tunnel failed, response 502`，DNS 正常但 TCP 连接失败 | ✅ 已验证 (verdict 证据) |
| **3 (中)** | **Step 1 在 Vercel 上可能超时** (30s limit) | **中** | audit.js 并行 fetch Jina (15s) + Lighthouse (未知) + DeepSeek API (未知)，总时间可能超过 30s | ❌ 未验证 (需网络通后测试) |

### 设计师补充意见

1. **根因 1 是确定性 bug**，与网络环境无关。无论 Vercel 部署是否正常，测试都会"假通过"。这是**必须修复**的问题。
2. **根因 2 是环境特定问题**，但不代表 Vercel 部署一定正常。需要在无代理环境下验证。
3. **根因 3 是潜在风险**，当前 audit.js 的超时设置（Jina 15s + direct fetch 15s + DeepSeek API 未知）可能在 Vercel 30s 限制下超时。但守门人未验证此点。

**结论**: 守门人的根因判定方向正确，但**遗漏了根因 3 的潜在风险**，且**根因 1 (测试假通过) 应排第一位**（因为是确定性 bug，与网络无关）。

---

## 2. 修复目标

### 主目标

让 `npm run demo-test` 在用户本机（无代理）能跑通 **L1 + L3 全过**。

具体指标：
- L1 单元测试：全部 pass（当前未跑，需补充）
- L3 E2E 测试：Step 1-4 + Gate 3.5 全部 pass（真实 pass，非假通过）
- 总耗时：Step 1 在 Vercel 30s 内完成

### 副目标

测试代码不能再"假通过"（reportId === null 必须显式 fail）。

**硬规则**: 任何 `reportId === null` 时提前 return 且被 node:test 记为 pass 的行为 = **FAIL**（守门人必须卡死）。

---

## 3. 方案设计 (给工匠的)

### 方案 A: 最小修复 (推荐)

**目标**: 只修复确定性 bug（测试假通过 + 增加健康检查），不改业务逻辑。

#### A1. 修复 L3 测试假通过漏洞

**改什么**:
- 文件: `tests/integration/demo-flow.test.js`
- 行号: 51-54, 62-65, 81-84, 102-105
- 改前思路: `if (!reportId) { console.log('⏭ Skipped'); return; }` → node:test 记为 pass
- 改后思路: `if (!reportId) { assert.fail('Step 1 must pass first. reportId is null.'); }` → node:test 记为 fail

**具体改法 (给工匠的 spec，不写代码)**:
- 将 4 处 `if (!reportId) { return; }` 改为 `assert.fail('依赖 Step 1 通过，但 reportId 为 null')`
- 或者：将 4 个 test 改为依赖 `before` 钩子，若 Step 1 失败则跳过整个 suite

**风险**:
- Vercel 30s 超时? **无** (不改 audit.js)
- 成本? **无** (只改测试)
- 回归? **无** (只改测试，不影响生产代码)

**工作量**: 小 (1-2 小时)

**可逆性**: 易 (改回 `return` 即可)

#### A2. 增加 L3 健康检查 (fail fast)

**改什么**:
- 文件: `tests/integration/demo-flow.test.js`
- 位置: `before` 钩子 (第 19-21 行)
- 改前思路: 只打印 `=== Layer 3 E2E: testing ${BASE_URL} ===`
- 改后思路: 在 `before` 中增加 BASE_URL 可达性预检（GET `/`），若失败则 `assert.fail('BASE_URL unreachable: ' + error)`

**具体改法**:
- 在 `before` 钩子中，先 `await fetch(BASE_URL + '/')`
- 若 `res.ok` 为 false 或抛异常，则 `assert.fail('BASE_URL unreachable: ' + BASE_URL + ', error: ' + error)`
- 这样可以在测试最开始就 fail fast，并给出明确错误信息（而不是等到 Step 1 才报 `fetch failed`）

**风险**:
- Vercel 30s 超时? **无** (只改测试)
- 成本? **无**
- 回归? **无**

**工作量**: 小 (1 小时)

**可逆性**: 易

#### A3. 支持本地调试 (VERCEL_URL 环境变量)

**改什么**:
- 文件: `tests/integration/demo-flow.test.js`
- 行号: 15
- 改前思路: `const BASE_URL = process.env.VERCEL_URL || 'https://roastaudit.vercel.app';`
- 改后思路: `const BASE_URL = process.env.VERCEL_URL || process.env.BASE_URL || 'https://roastaudit.vercel.app';`

**具体改法**:
- 支持 `BASE_URL` 环境变量（与 Vercel 的 `VERCEL_URL` 区分）
- 这样用户可以在本地 `vercel dev` 中调试：`BASE_URL=http://localhost:3000 npm run demo-test`

**风险**: **无**

**工作量**: 小 (< 30 分钟)

**可逆性**: 易

---

### 方案 B: 优化 Step 1 速度 (Vercel 30s 内完成)

**目标**: 降低 Step 1 超时风险，优化 audit.js 的并行 fetch 策略。

#### B1. 缩短 Jina 和 direct fetch 超时

**改什么**:
- 文件: `api/audit.js`
- 行号: 63 (Jina 超时 15s), 88 (direct fetch 超时 15s)
- 改前思路: `AbortSignal.timeout(15000)`
- 改后思路: `AbortSignal.timeout(10000)` (缩短到 10s)

**风险**:
- Vercel 30s 超时? **降低** (缩短超时时间)
- 成本? **无**
- 回归? **中** (可能增加 Jina/direct fetch 失败率，但已有 `Promise.allSettled` 容错)

**工作量**: 小 (< 30 分钟)

**可逆性**: 易 (改回 15000 即可)

#### B2. 将 Lighthouse 改为可选 (软降级)

**改什么**:
- 文件: `api/audit.js`
- 行号: 73
- 改前思路: `fetchLighthouse(url)` 无超时设置
- 改后思路: 在 `fetchLighthouse` 函数内部增加 `AbortSignal.timeout(10000)`，或在调用时包裹 `Promise.race`

**具体改法 (给工匠的 spec)**:
- 检查 `api/_lib/lighthouse.js` 是否有超时设置
- 若无，则增加 10s 超时（Lighthouse API 通常较慢，需设置合理超时）
- 若 Lighthouse 超时，则 `lighthouseResult` 为 `null`，但不影响主流程（已有 `Promise.allSettled` 容错）

**风险**:
- Vercel 30s 超时? **降低** (Lighthouse 超时时不会影响主流程)
- 成本? **无**
- 回归? **低** (Lighthouse 数据可能缺失，但已有容错)

**工作量**: 中 (需检查 lighthouse.js 实现)

**可逆性**: 易

#### B3. 增加 Step 1 总耗时日志

**改什么**:
- 文件: `api/audit.js`
- 位置: Step 1-6 的关键节点
- 改前思路: 无耗时日志
- 改后思路: 在 `handler` 开始和结束时 `console.log('Step N duration: Xms')`

**具体改法**:
- 在 `handler` 开始处记录 `startTime = Date.now()`
- 在 Jina/Lighthouse/HTML head 并行 fetch 后记录耗时
- 在 DeepSeek API 调用后记录耗时
- 在返回 200 前记录总耗时 `console.log('Total duration: ' + (Date.now() - startTime) + 'ms')`

**风险**: **无**

**工作量**: 小 (1 小时)

**可逆性**: 易

---

### 方案 C: 完整方案 (A + B 组合)

**目标**: 同时修复测试假通过 + 优化 Step 1 速度 + 增加健康检查 + 本地调试支持。

#### C1. 方案 A1 + A2 + A3

(同方案 A)

#### C2. 方案 B1 + B2

(同方案 B，但去掉 B3 日志，因为 Vercel 日志已足够)

#### C3. 补充 L1 单元测试

**改什么**:
- 文件: `tests/unit/` (当前可能为空)
- 改前思路: 无 L1 测试
- 改后思路: 为 `api/audit.js` 的核心逻辑写单元测试（mock fetch, mock OpenAI, mock Upstash）

**具体改法 (给工匠的 spec)**:
- 创建 `tests/unit/audit.test.js`
- Mock `fetch` (Jina, Lighthouse, HTML head, DeepSeek API, Upstash)
- 测试正常流程：POST /api/audit → 200 + reportId
- 测试异常流程：missing URL → 400, Jina failed → fallback, DeepSeek failed → 500
- 测试 Lighthouse 数据格式：performanceScore 应为 number

**风险**:
- Vercel 30s 超时? **无** (单元测试不走 Vercel)
- 成本? **无**
- 回归? **无** (只加测试)

**工作量**: 中 (2-4 小时)

**可逆性**: 易

---

## 4. 推荐方案

### 选哪个？

**推荐方案: 方案 A (最小修复) + 方案 B2 (Lighthouse 超时)**

**理由**:
1. **方案 A1 (修复假通过)** 是**必须做**的（确定性 bug，与网络无关）
2. **方案 A2 (健康检查)** 是**高价值**的（fail fast + 明确错误信息）
3. **方案 A3 (本地调试)** 是**高价值**的（方便本地调试）
4. **方案 B2 (Lighthouse 超时)** 是**预防性修复**（降低 Vercel 30s 超时风险）
5. **方案 B1 (缩短 Jina 超时)** 是**可选的**（Jina 已有 `Promise.allSettled` 容错，缩短超时可能增加失败率）
6. **方案 C3 (L1 单元测试)** 是**后续迭代**的（当前 L1 未跑，但不阻塞 L3）

**不选方案 B1 的理由**: Jina 超时 15s 是合理的（Vercel 30s - DeepSeek API 调用时间）。缩短到 10s 可能增加失败率，且已有 `Promise.allSettled` 容错。

**不选方案 C (完整方案) 的理由**: 方案 C 工作量较大，且部分内容（L1 单元测试）不阻塞当前 FAIL。应**分阶段实施**：先方案 A + B2，再后续迭代加 L1。

### 验收标准 (守门人 PASS 必须满足的硬指标)

#### 硬指标 1: 测试不再假通过

- `tests/integration/demo-flow.test.js` 中，**不允许**出现 `if (!reportId) { return; }`
- 若 Step 1 失败，Step 2-4 **必须**显式 fail（而非 silently skip）
- 验证方法：故意让 Step 1 fail（如改 URL 为无效），跑 `npm run demo-test`，确认 Step 2-4 为 fail 而非 pass

#### 硬指标 2: 增加健康检查

- `before` 钩子中必须有 BASE_URL 可达性预检
- 若 BASE_URL 不可达，测试必须 fail fast 并给出明确错误信息（包含 BASE_URL 和具体错误）

#### 硬指标 3: Lighthouse 有超时保护

- `fetchLighthouse` 必须有 10s 超时（或在 `audit.js` 调用时设置超时）
- 验证方法：检查 `api/_lib/lighthouse.js` 或 `audit.js` 第 73 行附近是否有超时设置

#### 硬指标 4: L1 + L3 全过 (在无代理环境下)

- L1: `node --test tests/unit/` → 全部 pass
- L3: `npm run demo-test` → Step 1-4 + Gate 3.5 全部 pass
- Step 1 耗时 **必须** < 30s (Vercel maxDuration)

#### 硬指标 5: 假通过 = FAIL

**这是守门人必须卡死的硬规则**:

> 若守门人发现任何测试在 `reportId === null` 时提前 return 且被 node:test 记为 pass，则**直接判 FAIL**，无需跑完整测试。

### 风险预案

#### 预案 1: 方案 A 导致 L3 测试全部 fail (因为 Step 1 网络不通)

**现象**: 修复假通过后，若 Step 1 因网络问题失败，Step 2-4 会显式 fail，导致 L3 全部 fail。

**应对**:
- 这是**预期行为**（测试不再假通过）
- 工匠需在无代理环境下验证 Vercel 部署是否正常
- 若 Vercel 部署正常，则可能是本地代理问题，需在无代理环境下重新跑测试

#### 预案 2: 方案 B2 导致 Lighthouse 数据经常缺失

**现象**: Lighthouse API 超时 10s，导致 `lighthouse` 为 `null`。

**应对**:
- 这是**预期行为**（软降级）
- 前端需处理 `lighthouse === null` 的情况（显示 "Performance data unavailable"）
- 若 Lighthouse 经常超时，可考虑增加超时到 15s 或改用异步任务（后续迭代）

#### 预案 3: 方案 A + B 组合导致 Vercel 部署失败

**现象**: 改了 `audit.js` 后，Vercel 部署失败（如语法错误、依赖缺失）。

**应对**:
- 回退到上一 commit (`git revert`)
- 检查 Vercel 部署日志
- 在本地 `vercel dev` 中调试

---

## 5. 给守门人的验收清单

### L1 跑哪几个测试文件、期望 pass count

**测试文件**:
- `tests/unit/audit.test.js` (若存在)
- 或 `tests/unit/**/*.test.js` (所有单元测试)

**期望 pass count**:
- 若 `tests/unit/` 为空，则**先让工匠补充 L1 测试**，再跑守门人验收
- 若已有 L1 测试，则期望 **100% pass**

**命令**:
```bash
node --test tests/unit/
```

### L3 跑哪个命令、期望全过

**命令**:
```bash
npm run demo-test
```

**期望**:
- Step 1: pass (POST /api/audit 返回 200 + reportId + lighthouse)
- Step 2: pass (GET /api/report-pdf 返回 403)
- Step 3: pass (POST /api/checkout 返回 200 + unlocked=true)
- Step 4: pass (GET /api/report-pdf 返回 200 + PDF)
- Gate 3.5: pass (Lighthouse data persisted in full report)
- **总 pass count: 5/5** (无 skip, 无 fail)

**关键检查**:
- 若 Step 1 fail，Step 2-4 **必须**为 fail (而非 skip)
- 若 BASE_URL 不可达，测试 **必须**在 `before` 钩子中 fail fast

### L4 浏览器手测 checklist

**前提**: L1 + L3 全过后，部署到 Vercel (或本地 `vercel dev`)。

**用户应点的几个按钮、应看到的元素**:

#### L4.1 首页加载
- [ ] 打开 `https://roastaudit.vercel.app/`
- [ ] 应看到输入框 (placeholder: "Enter website URL")
- [ ] 应看到 "Audit" 按钮

#### L4.2 输入有效 URL
- [ ] 输入 `https://example.com`
- [ ] 点击 "Audit"
- [ ] 应看到 loading 状态 (spinner 或 "Auditing...")
- [ ] **Step 1 应在 30s 内完成** (重要!)

#### L4.3 查看报告
- [ ] 应看到 summary (包含 Overall Score)
- [ ] 应看到 Lighthouse 数据 (Performance Score, LCP, CLS)
- [ ] 应看到 "Unlock Full Report" 按钮

#### L4.4 PDF 下载 (demo mode)
- [ ] 点击 "Unlock Full Report"
- [ ] 应看到 demo unlock 成功 (无需真实支付)
- [ ] 点击 "Download PDF"
- [ ] 应下载 PDF 文件 (大小 > 1KB)

#### L4.5 错误处理
- [ ] 输入无效 URL (如 `not-a-url`)
- [ ] 应看到错误提示 ("Missing URL" 或 "Unable to fetch website")

### 明确写"假通过 = FAIL"

**守门人必须卡死的硬规则**:

> **假通过 = FAIL**
>
> 定义: 任何测试在依赖步骤失败时**未显式 fail**，而是 silently skip 或 return，且被测试框架记为 pass，即视为"假通过"。
>
> 示例:
> - `if (!reportId) { return; }` → node:test 记为 pass → **假通过 = FAIL**
> - `if (!reportId) { assert.fail('Step 1 must pass first'); }` → node:test 记为 fail → **正确**
> - `test.skip()` → node:test 记为 skip → **可接受** (但需在 verdict 中说明为何 skip)
>
> **验收时，守门人必须**:
> 1. 检查测试代码，确认无 `if (!reportId) { return; }` 模式
> 2. 故意让 Step 1 fail，确认 Step 2-4 显式 fail
> 3. 若发现假通过，直接判 FAIL，无需跑完整测试

---

## 6. 实施顺序 (给工匠的)

**Phase 1 (必须)**:
1. 修复 `tests/integration/demo-flow.test.js` 假通过漏洞 (方案 A1)
2. 增加 `before` 钩子健康检查 (方案 A2)
3. 支持 `BASE_URL` 环境变量 (方案 A3)

**Phase 2 (推荐)**:
4. 检查 `api/_lib/lighthouse.js` 是否有超时设置，若无则增加 10s 超时 (方案 B2)

**Phase 3 (可选)**:
5. 补充 L1 单元测试 (方案 C3)
6. 优化 Step 1 速度 (方案 B1, B3)

---

## 7. 设计师签名

- **设计师**: designer
- **日期**: 2026-06-14
- **基于**: verdict-001-demo-test-fail.md + audit.js + demo-flow.test.js + vercel.json
- **下一步**: 工匠按 Phase 1-2 实施，守门人按验收清单验证

---

**END OF SPEC**

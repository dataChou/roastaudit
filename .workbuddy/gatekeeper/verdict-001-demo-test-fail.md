# Verdict-001: demo-test Step 1 fetch timeout

## 复现命令

```bash
cd /Users/zhouzhou/WorkBuddy/2026-06-13-11-20-14/roastaudit && npm run demo-test 2>&1
```

## 完整测试输出

```
> roastaudit@1.0.0 demo-test
> node --test tests/integration/demo-flow.test.js


=== Layer 3 E2E: testing https://roastaudit.vercel.app ===

  ⏭ Skipped (Step 1 failed)
  ⏭ Skipped (Step 1 failed)
  ⏭ Skipped (Step 1 failed)
  ⏭ Skipped
✖ Step 1: POST /api/audit returns 200 with reportId + lighthouse (10568.158474ms)
✔ Step 2: GET /api/report-pdf returns 403 before unlock (0.924723ms)
✔ Step 3: POST /api/checkout (demo) unlocks report (0.193792ms)
✔ Step 4: GET /api/report-pdf returns 200 + PDF after unlock (0.198108ms)
✔ Gate 3.5 verification: Lighthouse data persisted in full report (0.194895ms)
ℹ tests 5
ℹ suites 0
ℹ pass 4
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10652.777353

✖ failing tests:

test at tests/integration/demo-flow.test.js:23:1
✖ Step 1: POST /api/audit returns 200 with reportId + lighthouse (10568.158474ms)
  TypeError: fetch failed
      at node:internal/deps/undici/undici:14976:13
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async TestContext.<anonymous> (file:///Users/zhouzhou/WorkBuddy/2026-06-13-11-20-14/roastaudit/tests/integration/demo-flow.test.js:24:15)
      at async Test.run (node:internal/test_runner/test:1054:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3) {
    [cause]: Error [ConnectTimeoutError]: Connect Timeout Error (attempted address: roastaudit.vercel.app:443, timeout: 10000ms)
        at onConnectTimeout (node:internal/deps/undici/undici:2746:28)
        at Immediate._onImmediate (node:internal/deps/undici/undici:2727:11)
        at process.processImmediate (node:internal/timers:484:21) {
      code: 'UND_ERR_CONNECT_TIMEOUT'
    }
  }
```

## 网络探活

### Vercel URL 可达性

命令：`curl -sS -o /dev/null -w "HTTP %{http_code} | DNS %{time_namelookup}s | Connect %{time_connect}s | TLS %{time_appconnect}s | TTFB %{time_starttransfer}s | Total %{time_total}s\n" https://roastaudit.vercel.app/`

结果：
```
curl: (56) CONNECT tunnel failed, response 502
HTTP 000 | DNS 0.006098s | Connect 0.006237s | TLS 0.000000s | TTFB 0.000000s | Total 10.012s
```

- **Vercel URL 状态**: HTTP 000 (连接失败)，curl exit code 56 (CONNECT tunnel failed, response 502)
- **DNS 解析**: 正常 (0.006s)
- **TCP Connect**: 失败 (代理返回 502)
- **TLS/TTFB**: 未到达

### Vercel 部署 header

命令：`curl -sS -I https://roastaudit.vercel.app/api/audit 2>&1 | head -30`

结果：
```
curl: (56) CONNECT tunnel failed, response 502
HTTP/1.1 502 Bad Gateway
Connection: close
```

- **Vercel 部署时间**: 无法获取（502 由代理/网关返回，未到达 Vercel 服务器）
- **Vercel 部署 region**: 无法获取
- **结论**: `roastaudit.vercel.app` 当前通过代理访问时返回 502 Bad Gateway，TCP 连接无法建立。

### 可能原因分析

1. **代理/防火墙拦截**: curl 报错 `CONNECT tunnel failed, response 502` 表明 HTTP CONNECT 请求被代理或网关拒绝。这可能是本地网络环境（公司代理、防火墙）导致的，而非 Vercel 部署本身的问题。
2. **Vercel 部署实际状态未知**: 由于连接未到达 Vercel 服务器，无法确认部署是否正常运行。需要在无代理环境下验证。

## Git 状态

### 最近 10 条 commit

```
13c8d46 feat: Lighthouse performance + real HTML head extraction (Gate 3.5)
e5a5a30 fix: PDF quality - remove severity emoji + clean LLM artifacts
2a585a3 fix: complete demo-mode payment flow + Upstash migration for report APIs
896305d fix: checkout.js demo mode — no real payment
62d1805 fix: update pricing from $4.99 to $0.99/single + $1.99/3-pack
4233b05 fix: switch api/audit.js to Deepseek + Jina + Upstash
d7ec0d7 feat: RoastAudit MVP - single-file HTML UI, audit/PDF/checkout APIs
025f009 feat: initialize RoastAudit project (single HTML + Vercel Functions)
```

- **最近 3 commit**:
  - `13c8d46` feat: Lighthouse performance + real HTML head extraction (Gate 3.5)
  - `e5a5a30` fix: PDF quality - remove severity emoji + clean LLM artifacts
  - `2a585a3` fix: complete demo-mode payment flow + Upstash migration for report APIs

### 工作区状态

```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.workbuddy/

nothing added to commit but untracked files present (use "git add" totrack)
```

- **工作区是否 dirty**: NO（无跟踪文件变更，仅存在未跟踪的 `.workbuddy/` 目录）
- **是否已 push**: YES（`Your branch is up to date with 'origin/main'`）

## 测试结果汇总

| 层级 | 工具 | 结果 |
|------|------|------|
| L1 单元 | `node --test tests/unit/` | 未跑 |
| L2 集成 | `node --test tests/integration/` | 未跑 |
| L3 E2E | `npm run demo-test` | **FAIL** (1 fail, 4 pass 但实为 skip) |

> **注意**: Step 2-4 和 Gate 3.5 显示 `✔ pass`，但耗时均 <1ms，表明这些测试因 `reportId === null` 提前 return，未执行真实断言。node:test 对提前 return 的 test 记为 pass，属于误报。L3 实际有效测试仅 Step 1，且失败。

## 根因分析 (独立判断)

### 观察到的证据

1. `npm run demo-test` 复现用户报告的 `ConnectTimeoutError`（10s 超时）
2. `curl https://roastaudit.vercel.app/` 返回 `502 Bad Gateway` + `CONNECT tunnel failed`
3. DNS 解析正常 (0.006s)，但 TCP 连接未建立
4. git 工作区 clean，最新 commit `13c8d46` 已 push

### 判定

**根因 (c) 网络问题（本地代理/防火墙拦截）与 (a) Vercel 部署状态未知 叠加。**

具体：

1. **curl 报错 `CONNECT tunnel failed, response 502`** 是典型的企业代理拦截特征。本地环境（macOS, Darwin 20.6.0）可能配置了代理，导致无法直连 `roastaudit.vercel.app`。
2. **无法确认 Vercel 部署是否正常运行**。需要在无代理环境下（或通过设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` / 绕过代理）重新测试。
3. **代码层面**: 最新 commit `13c8d46` 添加了 Lighthouse 功能，代码变更可能引入了问题，但由于网络不通，无法验证 Vercel 部署后的实际行为。

### 责任判定

| 可能原因 | 概率 | 说明 |
|----------|------|------|
| (a) Vercel 部署挂了 | 低 | 502 来自代理，未到达 Vercel |
| (b) Step 1 真超过 10s | 无法判断 | 需网络通后才能测 |
| (c) 网络问题（代理拦截） | **高** | curl 明确报 CONNECT tunnel 502 |
| (d) 其他（URL 错误等） | 低 | URL 正确，DNS 解析正常 |

## 结论

**FAIL**

L3 E2E 测试未通过（Step 1 连接超时）。由于网络环境限制，无法确认是代码问题还是部署问题。

### 验收标准（PASS 条件）

1. `npm run demo-test` 在**无代理环境下**能完成 Step 1（POST `/api/audit` 返回 200）
2. 若确认 Vercel 部署正常，则需在 CI 或无代理环境中重新跑测试
3. L1 + L2 测试也需补充运行（本次未跑）

## 给工匠的退回意见

### 阻塞项（必须修复）

1. **[网络隔离]** 当前无法验证 Vercel 部署是否正常工作。工匠需：
   - 在 Vercel Dashboard 确认最近部署状态（`13c8d46` 是否部署成功）
   - 提供 Vercel 部署日志中是否有错误
   - 如有环境变量缺失（DeepSeek API Key、Upstash Redis URL 等），需在 Vercel 项目设置中补充

2. **[测试可靠性]** `demo-flow.test.js` 中 Step 2-4 在 `reportId === null` 时提前 return，被 node:test 记为 pass，属于**假通过**。建议：
   - 改为 `assert.fail('Step 1 must pass first')` 或 `test.skip()` 明确标记为 skipped
   - 或改用 `describe/it` 结构，在 before 中做 Step 1，失败时跳过整个 suite

### 建议（非阻塞）

- 在测试中加入 `BASE_URL` 可达性预检（Step 0: 健康检查），若 URL 不可达则 fail fast 并给出明确错误信息
- 考虑在 `package.json` 的 `demo-test` 脚本中允许通过环境变量 `VERCEL_URL` 指定测试目标，方便在本地 `vercel dev` 中调试

---
*Verdict by: 守门人 (gatekeeper) | 日期: 2026-06-14 | 基于证据: 测试输出 + curl 探活 + git log*

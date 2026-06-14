# IMPL-002: Demo Mode Implementation

> Commit: `2e8be6a` | Author: crafter | Date: 2026-06-14

## 改动文件

| 文件 | 操作 | 行号 | 摘要 |
|------|------|------|------|
| `api/_lib/demo-mode.js` | **新建** | 全文 56 行 | `isDemoMode()` + `generateDemoReport(url)` + `generateDemoSummary(domain)` |
| `api/audit.js:5` | 修改 | L5 | 新增 `import { isDemoMode, generateDemoReport } from './_lib/demo-mode.js'` |
| `api/audit.js:52-78` | 修改 | L52-78 | URL 校验后插入 demo 分支：生产硬拒绝 + mock 返回 + best-effort Upstash 存储 |
| `api/_lib/lighthouse.js:4-5,8-18` | 修改 | L4-18 | 新增 `import { isDemoMode }` + 防御性 demo mock 守卫 |
| `api/_lib/html-head.js:4-5,8-19` | 修改 | L4-19 | 新增 `import { isDemoMode }` + 防御性 demo mock 守卫 |
| `tests/unit/demo-mode.test.js` | **新建** | 全文 151 行 | 8 个 L1 单测 |
| `tests/unit/lighthouse.test.js:7-8` | 修改 | L7-8 | 新增 `DEEPSEEK_API_KEY` 设置以跳过 demo 模式 |
| `tests/unit/html-head.test.js:7-8` | 修改 | L7-8 | 新增 `DEEPSEEK_API_KEY` 设置以跳过 demo 模式 |

## L1 单测输出

```
✔ isDemoMode returns true when DEEPSEEK_API_KEY is unset
✔ isDemoMode returns true when DEEPSEEK_API_KEY is empty string
✔ isDemoMode returns true when DEEPSEEK_API_KEY is "dummy"
✔ isDemoMode returns false when DEEPSEEK_API_KEY is valid
✔ isDemoMode returns true in production when key is missing (audit.js should block)
✔ generateDemoReport returns complete data shape
✔ generateDemoReport summary contains Lighthouse reference
✔ generateDemoReport produces unique reportIds
✔ fetchHtmlHead extracts title
✔ fetchHtmlHead extracts OG tags
✔ fetchHtmlHead returns null on 404
✔ fetchHtmlHead returns null on timeout
✔ fetchHtmlHead handles missing head gracefully
✔ fetchLighthouse returns null on 500
✔ fetchLighthouse parses success response correctly
✔ fetchLighthouse handles score 0 (catastrophic)
✔ fetchLighthouse returns null on missing data
✔ fetchLighthouse returns null on timeout

ℹ tests 18
ℹ pass 18
ℹ fail 0
```

## 关键设计决策

1. **生产硬拒绝**：`isDemoMode()` 在 audit.js 中配合 `NODE_ENV === 'production'` 检查，生产环境缺失 key 返回 500，不静默降级
2. **防御 mock**：lighthouse.js 和 html-head.js 加了 `isDemoMode()` 守卫，防止误改 audit.js 后这些模块在 demo 环境下 crash
3. **已有测试兼容**：lighthouse.test.js 和 html-head.test.js 设置假 key 跳过 demo 模式，确保原有断言不被防御 mock 拦截

守门人请验 verdict-003。

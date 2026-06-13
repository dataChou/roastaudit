# 改动 SOP v1（Standard Operating Procedure）

> 生效日期：2026-06-14 | 适用范围：RoastAudit 所有代码/配置改动

---

## 一、SOP 总览

```
改动需求
   ↓
【第 1 步】分类判定（3 维度法）
   ↓
┌─ L0 触动定位 ─────────┐
│  工匠自查 → 直接 push   │
└────────────────────────┘
┌─ L1 小改 ─────────────┐
│  工匠实施 + L1 单测    │
│  → 守门人 L1 验收     │
└────────────────────────┘
┌─ L2 中改 ─────────────┐
│  总指挥派活             │
│  → 工匠实施 + L1+L3   │
│  → 守门人 L1+L3 验收  │
└────────────────────────┘
┌─ L3 大改 ─────────────┐
│  总指挥派活             │
│  → 设计师 spec         │
│  → 工匠实施 + L1+L2   │
│  → 守门人 L1+L2+L3   │
│  → 猎人红队（可选）    │
└────────────────────────┘
   ↓
【第 2 步】守门人出 verdict
   ↓
┌─ PASS ────────────────┐
│  commit + push         │
│  → Vercel 自动部署    │
└────────────────────────┘
┌─ FAIL ────────────────┐
│  退回工匠，附具体原因   │
│  → 工匠修复 → 重跑    │
└────────────────────────┘
```

---

## 二、L0 触动定位（typo / 单字符 / 注释）

### 触发示例
- 改 `"Erro"` → `"Error"`
- 删一行 console.log
- 改注释

### 流程
1. 工匠直接改
2. `git commit -m "fix: typo in xxx.js"`
3. `git push origin main`
4. **不需要守门人**

### 验收
- 工匠自己浏览器点一遍，确认没引入新 bug

---

## 三、L1 小改（文案 ≤3 处 / 颜色 / timeout）

### 触发示例
- 改 `$0.99` → `$1.99`（1 处文案）
- 改 `timeout(8000)` → `timeout(10000)`
- 改按钮颜色 `bg-blue-600` → `bg-purple-600`

### 流程
1. **工匠**：改代码 + 写/更新 L1 单测
2. **工匠**：跑 `node --test tests/unit/` 确认全过
3. **工匠**：commit `fix: <description> (L1)`
4. **工匠**：push 前先跑 `npm run demo-test`（L3 E2E）确认不 regression
5. **守门人**：抽时间跑 L1 + L3，出 verdict（可异步，不 block push）

### 验收标准
- L1 单测 100% 过
- L3 E2E 全过（0 fail, 0 skip）

---

## 四、L2 中改（加字段 / 改接口 / 文案 >3 处）

### 触发示例
- 在 `/api/audit` 返回里加 `screenshotUrl` 字段
- 改付费流程（加 3-pack 选项）
- 改价格 `$4.99` → `$0.99`（已发生，实际是 L3）

### 流程
1. **总指挥**：在 task list 里建任务，指派工匠
2. **工匠**：读任务 → 改代码 + 写 L1 单测 + 更新 `demo-flow.test.js`（如需要）
3. **工匠**：commit `feat: <description> (L2)` + push 到 `origin/main`
4. **守门人**：跑 L1 + L3 → 出 verdict（**必须 PASS 才能 merge**，若用分支则保护分支）

### 验收标准
- L1 单测 100% 过
- L3 E2E 全过
- 守门人 verdict 明确写 **PASS**（禁止 CONDITIONAL PASS）

---

## 五、L3 大改（新功能 / 新数据源 / 改定价）

### 触发示例
- 加 Lighthouse 数据源（已发生）
- 加截图功能（Microlink）
- 改定价模型（$0.99/single → $2.99/single）

### 流程（完整 OPC 流程）
1. **总指挥**：建任务，指派设计师
2. **设计师**：写 `spec-NNN-xxx.md`（根因 + 方案 + 验收标准）
3. **总指挥**：审核 spec → 派给工匠
4. **工匠**：按 spec 实施 + 写 L1 单测 + 更新 L3 E2E
5. **工匠**：commit `feat: <description> (L3)` + push
6. **守门人**：跑 L1 + L2 + L3 → 出 verdict
7. **猎人**（可选）：红队攻击（测边界、测滥用、测成本泄露）

### 验收标准
- L1 单测 100% 过
- L2 集成测试 100% 过
- L3 E2E 全过
- 守门人 verdict = **PASS**
- L4 浏览器手测 ✔（6 项 checklist）

---

## 六、紧急情况（Hotfix）

### 触发
- 生产环境 500 错误
- API key 泄露
- 付费流程故障

### 流程（允许临时跳步）
1. **工匠**：立刻修复 + 写 L1 单测
2. **工匠**：commit `hotfix: <description>` + push
3. **守门人**：上线后 2 小时内补跑 L1 + L3，出 verdict
4. 若 verdict = FAIL → 立刻 rollback

### 约束
- Hotfix 只能用于 P0 故障
- 非 P0 必须用正常流程

---

## 七、Commit Message 规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `fix:` | Bug 修复 | `fix: L3 test no false-pass` |
| `feat:` | 新功能 | `feat: Lighthouse performance panel` |
| `hotfix:` | 紧急生产修复 | `hotfix: DeepSeek 402 error` |
| `docs:` | 文档 | `docs: add crafter impl report` |
| `test:` | 测试 | `test: add L1 unit tests for lighthouse` |

**必须附**：
- `(L1)` / `(L2)` / `(L3)` 标注改动级别
- 若是 L3，附 `spec-NNN` 引用

**示例**：
```
feat: Lighthouse performance + HTML head (L3, spec-001)
fix: L3 test false-pass + health check (L1, spec-001)
```

---

## 八、文件追踪表

| 文件 | 负责人 | 更新时机 |
|------|--------|----------|
| `.workbuddy/shared/memory.md` | 总指挥 | 流程改革时 |
| `.workbuddy/shared/02-change-sop.md` | 总指挥 | 流程优化时 |
| `.workbuddy/gatekeeper/testing/01-test-suite-v1.md` | 守门人 | 测试套件升级时 |
| `.workbuddy/designer/spec-NNN-*.md` | 设计师 | 每次 L3 改动 |
| `.workbuddy/crafter/impl-NNN-*.md` | 工匠 | 每次实施 |
| `.workbuddy/gatekeeper/verdict-NNN-*.md` | 守门人 | 每次验收 |

---

## 九、违规案例（已发生）

### 案例 1：价格 `$4.99` → `$0.99` 没走流程
- **应做**：L3 大改 → 设计师 spec → 工匠实施 → 守门人 L1+L3
- **实际做**：工匠直接改 + push
- **后果**：用户发现价格没更新，手动指出
- **修复**：以后 L2/L3 改动，守门人必须在 PR/merge 前验 L1+L3

### 案例 2：加 Lighthouse 总指挥一人包办
- **应做**：设计师 spec → 工匠实施 → 守门人验收
- **实际做**：总指挥代理了 3 个角色
- **后果**：角色边界模糊，用户质疑"那些 agent 没有动"
- **修复**：总指挥不写代码，严格按 OPC 流程派活

### 案例 3：L3 E2E "假通过"
- **应做**：Step 2-4 在 `reportId === null` 时应显式 fail
- **实际做**：`return` 静静跳过，node:test 记为 pass
- **后果**：守门人以为测试全过，实际只跑了 Step 1
- **修复**：已修复（Phase 1.1），守门人必须检查测试代码无 `return` 漏洞

---

*本 SOP 是强制规范，所有角色必须严格遵守。总指挥负责监督执行。*

# OPC v2.7 — 共享流程规范 (running contract)

> 本文件是**运行时合同**，不是事后文档。每个 agent 启动时必须先读它。

## 角色边界 (硬规则，违反 = 退回)

| 角色 | 可做 | 不可做 | 交付物 |
|------|------|--------|--------|
| **总指挥 (commander)** | 派活、追踪 task list、收 verdict、转交用户 | 写代码 / 写设计稿 / 写测试 verdict | task updates + 给用户的人话汇报 |
| **设计师 (designer)** | 写 PRD / design spec / UX 稿 | 写实现代码 / 跑测试 / 出 PASS | `designer/spec-NNN-xxx.md` |
| **工匠 (crafter)** | 写代码、commit、push、写 L1/L2 单元测试 | 出 PASS / PASS-conditional / 跑 E2E / 改 PRD | `crafter/impl-NNN-xxx.md` + commit hash |
| **守门人 (gatekeeper)** | 跑测试、出 verdict、复现 bug、量级检查 | 改实现代码 / 改 PRD / 改 spec | `gatekeeper/verdict-NNN-xxx.md` |
| **猎人 (hunter)** | 调研市场 / 找竞品 / 红队攻击 | 写产品代码 | `hunter/research-NNN-xxx.md` |

## 流程 (每次改动必走)

```
总指挥派活
   ↓
设计师 → spec-NNN.md (根因 + 方案 + 验收标准)
   ↓
工匠    → 实现 + L1 单测 + commit
   ↓
守门人  → 跑 L1 + L2 + L3 + 出 verdict
   ↓
[verdict = PASS] → 总指挥收 → 告知用户
[verdict = FAIL] → 退回工匠，循环
```

## 改动分级 (决定谁能跳过)

| 级别 | 触发 | 必走 |
|------|------|------|
| **大改 (L3)** | 加新功能 / 改业务模型 / 加新数据源 | 设计师 → 工匠 → 守门人 |
| **中改 (L2)** | 加字段 / 改接口 / 改文案（>3 处） | 工匠 → 守门人 |
| **小改 (L1)** | 改文案 ≤3 处 / 改颜色 / 改 timeout | 工匠 → 守门人 L1 单测 |
| **触动定位 (L0)** | typo / 单字符 / 仅注释 | 工匠自查 |

**判定不了 = 按上一级**。

## 测试 (守门人必跑)

| 层级 | 工具 | 工匠写 | 守门人跑 |
|------|------|--------|----------|
| L1 单元 | `node --test tests/unit/` | ✅ | ✅ |
| L2 集成 | `node --test tests/integration/` | ✅ | ✅ |
| L3 E2E | `node --test tests/integration/demo-flow.test.js` | 写 | ✅ (必跑，必须全过) |
| L4 浏览器 | Chrome 手测 | ✗ | ✅ (用户或守门人) |

**L3 全过 + L1/L2 全过 = 才算 PASS。** 任何 skip / fail = FAIL。

## verdict 模板

```markdown
# Verdict-NNN: <title>

## 复现命令
<粘贴可复现的命令>

## 测试结果
- L1: <pass count>/<total>
- L2: <pass count>/<total>
- L3: <pass count>/<total>
- L4: 浏览器手测 / 未跑

## 结论
**PASS / FAIL**

## 证据
<粘贴测试输出最后 20 行>
```

## 失败信号 (FAIL 触发条件)

- L1/L2/L3 任一未跑 / 跳过
- L3 实际跑 = fail 但 verdict 写 PASS
- verdict 写"CONDITIONAL PASS" (这个词 = 我代理时埋的雷，已废除)
- 没有 commit hash 引用
- 测试输出被截断 / 选择性粘贴

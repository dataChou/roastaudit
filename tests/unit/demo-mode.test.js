// tests/unit/demo-mode.test.js — Unit tests for demo mode (spec-002)
// Run: node --test tests/unit/demo-mode.test.js

import { test } from 'node:test';
import assert from 'node:assert';

// ===== isDemoMode() 触发条件 =====

test('isDemoMode returns true when DEEPSEEK_API_KEY is unset', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true);
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

test('isDemoMode returns true when DEEPSEEK_API_KEY is empty string', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = '';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true);
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

test('isDemoMode returns true when DEEPSEEK_API_KEY is "dummy"', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'dummy';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true);
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

test('isDemoMode returns false when DEEPSEEK_API_KEY is valid', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'sk-real-api-key-12345';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), false);
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

// ===== 新 spec-003 case =====

test('isDemoMode: DEMO_MODE=true overrides everything (even production + missing key)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  const originalDemo = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'production';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true, 'DEMO_MODE=true should force demo mode even in production');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDemo !== undefined) process.env.DEMO_MODE = originalDemo;
    else delete process.env.DEMO_MODE;
  }
});

test('isDemoMode: DEMO_MODE=true overrides everything (even production + valid key)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  const originalDemo = process.env.DEMO_MODE;
  process.env.DEMO_MODE = 'true';
  process.env.DEEPSEEK_API_KEY = 'sk-real-key';
  process.env.NODE_ENV = 'production';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true, 'DEMO_MODE=true should force demo mode even with valid key');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDemo !== undefined) process.env.DEMO_MODE = originalDemo;
    else delete process.env.DEMO_MODE;
  }
});

test('isDemoMode: missing key + NODE_ENV=production → false (implicit fallback blocked)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  const originalDemo = process.env.DEMO_MODE;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.DEMO_MODE;
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), false, 'implicit fallback should be blocked in production');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDemo !== undefined) process.env.DEMO_MODE = originalDemo;
    else delete process.env.DEMO_MODE;
  }
});

test('isDemoMode: missing key + NODE_ENV=development → true (implicit fallback allowed)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  const originalDemo = process.env.DEMO_MODE;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'development';
  delete process.env.DEMO_MODE;
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    assert.equal(isDemoMode(), true, 'implicit fallback should work in non-production');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDemo !== undefined) process.env.DEMO_MODE = originalDemo;
    else delete process.env.DEMO_MODE;
  }
});

test('productionDemoBlockReason: returns string in production + demo mode (explicit opt-in)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  const originalDemo = process.env.DEMO_MODE;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'production';
  process.env.DEMO_MODE = 'true';  // Explicit opt-in to demo mode
  const { productionDemoBlockReason } = await import('../../api/_lib/demo-mode.js');
  try {
    const reason = productionDemoBlockReason();
    assert.ok(reason, 'should return block reason in production + demo (explicit opt-in)');
    assert.ok(reason.includes('DEMO mode'), 'reason should mention DEMO mode');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
    if (originalDemo !== undefined) process.env.DEMO_MODE = originalDemo;
    else delete process.env.DEMO_MODE;
  }
});

test('productionDemoBlockReason: returns null in production + real mode', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  process.env.DEEPSEEK_API_KEY = 'sk-real-key';
  process.env.NODE_ENV = 'production';
  const { productionDemoBlockReason } = await import('../../api/_lib/demo-mode.js');
  try {
    const reason = productionDemoBlockReason();
    assert.equal(reason, null, 'should return null when not in demo mode');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
  }
});

test('productionDemoBlockReason: returns null in non-production (even with demo)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'development';
  const { productionDemoBlockReason } = await import('../../api/_lib/demo-mode.js');
  try {
    const reason = productionDemoBlockReason();
    assert.equal(reason, null, 'should return null in non-production (defense in depth: isDemoMode may be true, but productionDemoBlockReason only blocks in production)');
  } finally {
    if (originalKey !== undefined) process.env.DEEPSEEK_API_KEY = originalKey;
    else delete process.env.DEEPSEEK_API_KEY;
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv;
    else delete process.env.NODE_ENV;
  }
});

// ===== generateDemoReport() 数据形状 =====

test('generateDemoReport returns complete data shape', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const { generateDemoReport } = await import('../../api/_lib/demo-mode.js');
  try {
    const result = generateDemoReport('https://example.com');

    // reportId
    assert.ok(result.reportId, 'missing reportId');
    assert.ok(result.reportId.startsWith('demo-'), 'reportId should start with "demo-"');

    // summary (200+ chars)
    assert.ok(result.summary, 'missing summary');
    assert.ok(result.summary.length >= 200, `summary too short: ${result.summary.length} chars`);
    assert.ok(result.summary.includes('[DEMO MODE]'), 'summary should include [DEMO MODE] marker');

    // lighthouse (完整对象)
    assert.ok(result.lighthouse, 'missing lighthouse');
    assert.equal(typeof result.lighthouse.performanceScore, 'number');
    assert.equal(typeof result.lighthouse.largestContentfulPaint, 'string');
    assert.equal(typeof result.lighthouse.cumulativeLayoutShift, 'string');
    assert.equal(typeof result.lighthouse.firstContentfulPaint, 'string');
    assert.equal(typeof result.lighthouse.totalBlockingTime, 'string');

    // htmlHead (完整对象)
    assert.ok(result.htmlHead, 'missing htmlHead');
    assert.equal(typeof result.htmlHead.title, 'string');
    assert.equal(typeof result.htmlHead.metaDescription, 'string');
    assert.equal(typeof result.htmlHead.ogTitle, 'string');
    assert.equal(typeof result.htmlHead.ogDescription, 'string');
    assert.equal(result.htmlHead.ogImage, null);
    assert.equal(typeof result.htmlHead.canonical, 'string');
    assert.equal(typeof result.htmlHead.h1, 'string');

    // screenshotUrl: 不应该出现在返回中
    assert.equal(result.screenshotUrl, undefined, 'screenshotUrl should not be set in demo mode');
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

// ===== summary 包含 Lighthouse 引用（Gate 3.5 验证） =====

test('generateDemoReport summary contains Lighthouse reference', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const { generateDemoReport } = await import('../../api/_lib/demo-mode.js');
  try {
    const result = generateDemoReport('https://example.com');
    assert.ok(result.summary.includes('Lighthouse'), 'summary must reference Lighthouse for Gate 3.5');
    assert.ok(result.summary.includes('Score'), 'summary must include score reference');
    assert.ok(result.summary.includes('85'), 'summary must include actual Lighthouse score');
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

// ===== 不同调用生成不同 reportId =====

test('generateDemoReport produces unique reportIds', async () => {
  const original = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const { generateDemoReport } = await import('../../api/_lib/demo-mode.js');
  try {
    const r1 = generateDemoReport('https://a.com');
    const r2 = generateDemoReport('https://b.com');
    assert.notEqual(r1.reportId, r2.reportId);
  } finally {
    if (original !== undefined) process.env.DEEPSEEK_API_KEY = original;
    else delete process.env.DEEPSEEK_API_KEY;
  }
});

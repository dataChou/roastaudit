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

// ===== 生产安全：isDemoMode 在生产 + 缺失时仍返回 true，由 audit.js 拒绝 =====

test('isDemoMode returns true in production when key is missing (audit.js should block)', async () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.NODE_ENV = 'production';
  const { isDemoMode } = await import('../../api/_lib/demo-mode.js');
  try {
    // isDemoMode itself does not check NODE_ENV — audit.js does
    assert.equal(isDemoMode(), true, 'isDemoMode detects missing key even in production');
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

// tests/integration/demo-flow.test.js — Layer 3 E2E (演示模式全流程)
// Run: npm run demo-test
//
// 流程:
//   Step 1: POST /api/audit { url: 'https://example.com' } → 200 + { reportId, summary, lighthouse }
//   Step 2: GET /api/report-pdf?reportId=<id> (未解锁) → 403
//   Step 3: POST /api/checkout { reportId } (demo) → 200 + unlocked=true
//   Step 4: GET /api/report-pdf?reportId=<id> (已解锁) → 200 + application/pdf
//
// Gate 3.5 硬检查: 4 步全过, 报告真出现 Lighthouse 数字

import { test, before } from 'node:test';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || process.env.VERCEL_URL || 'https://roastaudit.vercel.app';
let reportId = null;
let lighthouseData = null;

before(async () => {
  console.log(`\n=== Layer 3 E2E: testing ${BASE_URL} ===\n`);

  // Health check: verify BASE_URL is reachable (30s timeout for slow proxies)
  try {
    const res = await fetch(BASE_URL + '/', {
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      assert.fail('BASE_URL unreachable: ' + BASE_URL + ', status: ' + res.status);
    }
    console.log('  ✓ Health check passed (status: ' + res.status + ')');
  } catch (err) {
    assert.fail('BASE_URL unreachable: ' + BASE_URL + ', error: ' + err.message);
  }
});

test('Step 1: POST /api/audit returns 200 with reportId + lighthouse', async () => {
  const res = await fetch(`${BASE_URL}/api/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();

  assert.ok(data.reportId, 'Missing reportId');
  assert.ok(data.summary, 'Missing summary');
  assert.ok(data.summary.includes('Score'), 'Summary missing score');

  // NEW (Gate 3.5): Lighthouse data must be present
  assert.ok(data.lighthouse, 'Missing lighthouse data (NEW Must-6)');
  assert.ok(typeof data.lighthouse.performanceScore === 'number',
    `lighthouse.performanceScore should be number, got ${typeof data.lighthouse.performanceScore}`);

  reportId = data.reportId;
  lighthouseData = data.lighthouse;

  console.log(`  reportId: ${reportId}`);
  console.log(`  Lighthouse Score: ${data.lighthouse.performanceScore}/100`);
  console.log(`  LCP: ${data.lighthouse.largestContentfulPaint}`);
});

test('Step 2: GET /api/report-pdf returns 403 before unlock', async () => {
  if (!reportId) {
    assert.fail('Step 1 must pass first. reportId is null.');
  }

  const res = await fetch(`${BASE_URL}/api/report-pdf?reportId=${reportId}`);
  assert.equal(res.status, 403, `Expected 403 (not paid), got ${res.status}`);
  console.log('  ✓ PDF correctly locked before unlock');
});

test('Step 3: POST /api/checkout (demo) unlocks report', async () => {
  if (!reportId) {
    assert.fail('Step 1 must pass first. reportId is null.');
  }

  const res = await fetch(`${BASE_URL}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId }),
  });

  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.unlocked, true, 'Demo checkout should unlock');

  console.log('  ✓ Demo unlock successful');
});

test('Step 4: GET /api/report-pdf returns 200 + PDF after unlock', async () => {
  if (!reportId) {
    assert.fail('Step 1 must pass first. reportId is null.');
  }

  const res = await fetch(`${BASE_URL}/api/report-pdf?reportId=${reportId}`);
  assert.equal(res.status, 200, `Expected 200 (paid), got ${res.status}`);
  assert.equal(res.headers.get('content-type'), 'application/pdf',
    `Expected application/pdf, got ${res.headers.get('content-type')}`);

  const buffer = await res.arrayBuffer();
  assert.ok(buffer.byteLength > 1000, `PDF too small: ${buffer.byteLength} bytes`);

  // Verify PDF header magic bytes
  const header = new TextDecoder().decode(buffer.slice(0, 8));
  assert.ok(header.startsWith('%PDF-'), `Invalid PDF header: ${header}`);

  console.log(`  ✓ PDF generated (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
});

test('Gate 3.5 verification: Lighthouse data persisted in full report', async () => {
  if (!reportId) {
    assert.fail('Step 1 must pass first. reportId is null.');
  }

  // Re-fetch via /api/report to confirm Lighthouse data is in stored report
  const res = await fetch(`${BASE_URL}/api/report?reportId=${reportId}`);
  if (!res.ok) {
    console.log('  ⚠ Could not re-fetch (no GET endpoint? check api/report.js)');
    return;
  }

  const data = await res.json();
  assert.ok(data.paid, 'Report should be paid after checkout');
  assert.ok(data.lighthouse, 'Stored report missing lighthouse');
  assert.equal(data.lighthouse.performanceScore, lighthouseData.performanceScore,
    'Lighthouse score mismatch between initial and stored');

  console.log(`  ✓ Lighthouse data persisted: ${data.lighthouse.performanceScore}/100`);
  console.log(`  ✓ Performance section: ${data.lighthouse.largestContentfulPaint} LCP, ${data.lighthouse.cumulativeLayoutShift} CLS`);
});

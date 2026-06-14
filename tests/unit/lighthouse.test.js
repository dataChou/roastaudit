// tests/unit/lighthouse.test.js — Unit test for fetchLighthouse()
// Run: node --test tests/unit/lighthouse.test.js

import { test } from 'node:test';
import assert from 'node:assert';

// Ensure demo mode is off so defensive mock in lighthouse.js doesn't interfere
if (!process.env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = 'sk-test-key-for-unit-tests';

// Mock fetch globally
const originalFetch = global.fetch;

function mockFetchResponse(status, body) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test('fetchLighthouse returns null on 500', async () => {
  mockFetchResponse(500, {});
  const { fetchLighthouse } = await import('../../api/_lib/lighthouse.js');
  const result = await fetchLighthouse('https://example.com');
  assert.equal(result, null);
  global.fetch = originalFetch;
});

test('fetchLighthouse parses success response correctly', async () => {
  mockFetchResponse(200, {
    lighthouseResult: {
      categories: { performance: { score: 0.65 } },
      audits: {
        'first-contentful-paint': { displayValue: '1.2 s' },
        'largest-contentful-paint': { displayValue: '2.8 s' },
        'cumulative-layout-shift': { displayValue: '0.15' },
        'total-blocking-time': { displayValue: '180 ms' },
      },
    },
  });

  const { fetchLighthouse } = await import('../../api/_lib/lighthouse.js');
  const result = await fetchLighthouse('https://example.com');

  assert.equal(result.performanceScore, 65);
  assert.equal(result.largestContentfulPaint, '2.8 s');
  assert.equal(result.cumulativeLayoutShift, '0.15');
  global.fetch = originalFetch;
});

test('fetchLighthouse handles score 0 (catastrophic)', async () => {
  mockFetchResponse(200, {
    lighthouseResult: {
      categories: { performance: { score: 0 } },
      audits: {
        'first-contentful-paint': { displayValue: '8.0 s' },
        'largest-contentful-paint': { displayValue: '12.0 s' },
        'cumulative-layout-shift': { displayValue: '0.8' },
        'total-blocking-time': { displayValue: '2000 ms' },
      },
    },
  });

  const { fetchLighthouse } = await import('../../api/_lib/lighthouse.js');
  const result = await fetchLighthouse('https://example.com');

  assert.equal(result.performanceScore, 0);
  global.fetch = originalFetch;
});

test('fetchLighthouse returns null on missing data', async () => {
  mockFetchResponse(200, { lighthouseResult: null });
  const { fetchLighthouse } = await import('../../api/_lib/lighthouse.js');
  const result = await fetchLighthouse('https://example.com');
  assert.equal(result, null);
  global.fetch = originalFetch;
});

test('fetchLighthouse returns null on timeout', async () => {
  global.fetch = async () => {
    throw new DOMException('Aborted', 'TimeoutError');
  };
  const { fetchLighthouse } = await import('../../api/_lib/lighthouse.js');
  const result = await fetchLighthouse('https://example.com');
  assert.equal(result, null);
  global.fetch = originalFetch;
});

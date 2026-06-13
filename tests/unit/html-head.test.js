// tests/unit/html-head.test.js — Unit test for fetchHtmlHead()
// Run: node --test tests/unit/html-head.test.js

import { test } from 'node:test';
import assert from 'node:assert';

const originalFetch = global.fetch;

function mockHtmlResponse(html) {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    }),
  });
}

test('fetchHtmlHead extracts title', async () => {
  mockHtmlResponse(`
    <html>
      <head>
        <title>Example Domain — For Testing</title>
        <meta name="description" content="A test page for examples.">
      </head>
      <body><h1>Hello World</h1></body>
    </html>
  `);

  const { fetchHtmlHead } = await import('../../api/_lib/html-head.js');
  const result = await fetchHtmlHead('https://example.com');

  assert.equal(result.title, 'Example Domain — For Testing');
  assert.equal(result.metaDescription, 'A test page for examples.');
  assert.equal(result.h1, 'Hello World');
  global.fetch = originalFetch;
});

test('fetchHtmlHead extracts OG tags', async () => {
  mockHtmlResponse(`
    <html>
      <head>
        <title>My Page</title>
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
        <meta property="og:image" content="https://cdn.example.com/img.png">
        <link rel="canonical" href="https://example.com/canonical">
      </head>
    </html>
  `);

  const { fetchHtmlHead } = await import('../../api/_lib/html-head.js');
  const result = await fetchHtmlHead('https://example.com');

  assert.equal(result.ogTitle, 'OG Title');
  assert.equal(result.ogDescription, 'OG Desc');
  assert.equal(result.ogImage, 'https://cdn.example.com/img.png');
  assert.equal(result.canonical, 'https://example.com/canonical');
  global.fetch = originalFetch;
});

test('fetchHtmlHead returns null on 404', async () => {
  global.fetch = async () => ({ ok: false, status: 404 });
  const { fetchHtmlHead } = await import('../../api/_lib/html-head.js');
  const result = await fetchHtmlHead('https://example.com');
  assert.equal(result, null);
  global.fetch = originalFetch;
});

test('fetchHtmlHead returns null on timeout', async () => {
  global.fetch = async () => {
    throw new DOMException('Aborted', 'TimeoutError');
  };
  const { fetchHtmlHead } = await import('../../api/_lib/html-head.js');
  const result = await fetchHtmlHead('https://example.com');
  assert.equal(result, null);
  global.fetch = originalFetch;
});

test('fetchHtmlHead handles missing head gracefully', async () => {
  mockHtmlResponse('<html><body>No head section</body></html>');
  const { fetchHtmlHead } = await import('../../api/_lib/html-head.js');
  const result = await fetchHtmlHead('https://example.com');
  // Should not crash, returns object with all nulls
  assert.equal(result.title, null);
  assert.equal(result.metaDescription, null);
  global.fetch = originalFetch;
});

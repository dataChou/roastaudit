// POST /api/audit — Generate website audit report (DeepSeek + Jina + Upstash + Lighthouse + HTML head)
import OpenAI from 'openai';
import { fetchLighthouse } from './_lib/lighthouse.js';
import { fetchHtmlHead } from './_lib/html-head.js';
import { isDemoMode, generateDemoReport, generateDemoFullReport, putDemoReport, productionDemoBlockReason } from './_lib/demo-mode.js';

// Upstash Redis REST helper
async function upstash(command, args = []) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const body = JSON.stringify([command, ...args]);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
  return res.json();
}

async function storeReport(reportId, data) {
  const result = await upstash('SETEX', [
    `report:${reportId}`,
    '86400',
    JSON.stringify(data),
  ]);
  if (!result || result.error) {
    console.warn('Upstash store failed:', result?.error);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ===== Production safety: refuse demo mode in production =====
  const blockReason = productionDemoBlockReason();
  if (blockReason) {
    console.error(`FATAL [${req.url}]: ${blockReason}`);
    return res.status(500).json({ error: 'Service configuration error. Please contact support.' });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  // ====== Demo mode: bypass external APIs + DeepSeek ======
  if (isDemoMode()) {
    // Safety: production must never enter demo mode
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: DEEPSEEK_API_KEY missing in production, refusing demo mode');
      return res.status(500).json({
        error: 'Service configuration error. Please contact support.',
      });
    }

    const data = generateDemoReport(url);
    console.log(`[DEMO] Serving mock report for ${url} (id: ${data.reportId})`);

    // Store full demo report in memory store (for checkout + report-pdf to read)
    const domain = url.replace(/https?:\/\//, '').replace(/\/.*/, '');
    putDemoReport(data.reportId, {
      url,
      domain,
      summary: data.summary,
      fullReport: generateDemoFullReport(domain, url),
      htmlHead: data.htmlHead,
      lighthouse: data.lighthouse,
      createdAt: new Date().toISOString(),
      paid: false,
    });

    // Best-effort: also store in Upstash (won't fail demo mode if missing)
    try { await storeReport(data.reportId, { url, summary: data.summary, paid: false, createdAt: new Date().toISOString() }); } catch (e) { console.warn('Demo Upstash store skipped:', e.message); }

    return res.status(200).json({
      reportId: data.reportId,
      summary: data.summary,
      lighthouse: data.lighthouse,
      htmlHead: data.htmlHead,
    });
  }

  try {
    // Lazy-init OpenAI (only when not in demo mode)
    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    });

    // ====== Step 1-3: Parallel data fetch (Gate 3.5: +Lighthouse +HTML head) ======
    const [jinaResult, lighthouseResult, htmlHeadResult] = await Promise.allSettled([
      // (1) Jina Reader: Markdown
      (async () => {
        try {
          const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
            headers: {
              'Authorization': `Bearer ${process.env.JINA_API_KEY || ''}`,
              'Accept': 'text/markdown',
            },
            signal: AbortSignal.timeout(15000),
          });
          if (!jinaRes.ok) return null;
          return await jinaRes.text();
        } catch (e) {
          console.warn('Jina failed:', e.message);
          return null;
        }
      })(),
      // (2) Lighthouse (NEW Must-6)
      fetchLighthouse(url),
      // (3) HTML head (NEW Must-7)
      fetchHtmlHead(url),
    ]);

    const pageText = jinaResult.status === 'fulfilled' ? jinaResult.value : null;
    const lighthouse = lighthouseResult.status === 'fulfilled' ? lighthouseResult.value : null;
    const htmlHead = htmlHeadResult.status === 'fulfilled' ? htmlHeadResult.value : null;

    // Fallback: direct HTML fetch if Jina failed
    let finalPageText = pageText;
    if (!finalPageText || finalPageText.length < 200) {
      try {
        const fetchRes = await fetch(url, {
          headers: { 'User-Agent': 'RoastAudit Bot/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await fetchRes.text();
        finalPageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50000);
      } catch (fetchErr) {
        console.warn('Direct fetch failed:', fetchErr.message);
      }
    }

    if (!finalPageText || finalPageText.length < 100) {
      return res.status(400).json({
        error: 'Unable to fetch website content. The site may be blocking crawlers or unavailable.',
      });
    }

    // ====== Step 4: Call DeepSeek with enriched context ======
    const domain = url.replace(/https?:\/\//, '').replace(/\/.*/, '');

    // Build REAL HTML HEAD data block (NEW Must-7)
    const htmlHeadBlock = htmlHead ? `
REAL HTML HEAD DATA (confirmed by direct fetch — use as ground truth, do NOT guess):
- Title tag: ${htmlHead.title || '(missing)'}
- Meta description: ${htmlHead.metaDescription || '(missing)'}
- OG title: ${htmlHead.ogTitle || '(missing)'}
- OG description: ${htmlHead.ogDescription || '(missing)'}
- Canonical URL: ${htmlHead.canonical || '(missing)'}
- First H1: ${htmlHead.h1 || '(missing)'}
- Title length: ${htmlHead.title ? htmlHead.title.length + ' chars' : 'N/A'}
- Meta description length: ${htmlHead.metaDescription ? htmlHead.metaDescription.length + ' chars' : 'N/A'}
` : `
REAL HTML HEAD DATA: (unavailable — fetch failed, infer from markdown content)
`;

    // Build Lighthouse data block (NEW Must-6)
    const lighthouseBlock = lighthouse ? `
LIGHTHOUSE PERFORMANCE DATA (Mobile, from Google PageSpeed Insights):
- Performance Score: ${lighthouse.performanceScore}/100
- First Contentful Paint: ${lighthouse.firstContentfulPaint}
- Largest Contentful Paint: ${lighthouse.largestContentfulPaint}
- Cumulative Layout Shift: ${lighthouse.cumulativeLayoutShift}
- Total Blocking Time: ${lighthouse.totalBlockingTime}

Industry averages: Performance ~65, LCP < 2.5s, CLS < 0.1
` : `
LIGHTHOUSE PERFORMANCE DATA: (unavailable — API failed or timed out)
`;

    const prompt = `You are a senior UX/SEO/CRO auditor. Analyze the website and output a clean, structured audit report in Markdown.

Website URL: ${url}
${htmlHeadBlock}${lighthouseBlock}
Website Content (Markdown from Jina Reader):
${finalPageText.substring(0, 60000)}

===== OUTPUT FORMAT (STRICT) =====

Output ONLY valid Markdown. No emojis. No decorative liness. Use plain text.

Structure:

# Audit Report for ${domain}

## Overall Score: [0-100]/100
One-line verdict: [Excellent / Good / Needs work / Poor]

## Performance (Lighthouse Mobile)
| Metric | Value | Benchmark | Status |
|--------|-------|-----------|--------|
| Performance Score | [X]/100 | >90 good | ✅/⚠️/❌ |
| First Contentful Paint | [X]s | <1.8s | ✅/⚠️/❌ |
| Largest Contentful Paint | [X]s | <2.5s | ✅/⚠️/❌ |
| Cumulative Layout Shift | [X] | <0.1 | ✅/⚠️/❌ |
| Total Blocking Time | [X]ms | <200ms | ✅/⚠️/❌ |

Takeaway: [One specific sentence about what to fix first for performance]

---

## 1. UX Issues (3-5 items)

### 1.1 [Severity] — [Issue Title]
**What's wrong:** [1-2 sentence description]
**Why it matters:** [Impact on users]
**How to fix:** [Specific actionable step. If code, show example]
**Effort:** [15 min / 30 min / 1 hr / 2-4 hrs / 1 day]
**Priority:** [🔴 Fix this week / 🟡 Fix this month / 🟢 Fix when you can]

### 1.2 ...
### 1.3 ...

---

## 2. SEO Problems (3-5 items)

Use the REAL HTML HEAD DATA above as ground truth. Do NOT guess.

### 2.1 [Severity] — [Issue Title]
**Current state:** [Show actual value from HTML head data, e.g. title tag = "Home Page"]
**Problem:** [Why this hurts SEO]
**Fix:** [Specific new text, e.g. change title to "RoastAudit — AI Website Audit Tool | $0.99"]
**Effort:** [...]
**Priority:** [...]

### 2.2 Title tag optimization
### 2.3 Meta description
### 2.4 Heading structure (H1 count, hierarchy)
### 2.5 Image alt tags (check 2-3 images)
### 2.6 Canonical URL

---

## 3. CRO Recommendations (3-5 items)

### 3.1 [Severity] — [Issue Title]
**What's missing:** [...]
**Impact:** [How much revenue/leads are lost]
**Fix:** [Specific CTA text, placement, or design change]
**Effort:** [...]
**Priority:** [...]

Topics to cover: CTA clarity, social proof, form friction, value proposition, trust signals.

---

## Priority Action Plan

### 🔴 This week (Critical):
1. [Fix 1]
2. [Fix 2]

### 🟡 This month (Important):
1. [Fix 3]
2. [Fix 4]

### 🟢 Later (Nice to have):
1. [Fix 5]

---

FORMATTING RULES:
- Use Markdown tables for comparison data
- Use numbered lists for action plans
- No emojis in body text (only ✅⚠️❌🔴🟡🟢 in status columns)
- Keep each issue to 5-7 lines max
- Be specific: say "change title tag to X" not "improve title tag"
- Use the REAL HTML HEAD DATA values, not guesswork`;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 6000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullReport = completion.choices[0].message.content;

    // ====== Step 5: Generate summary (with Lighthouse data) ======
    const summaryPrompt = lighthouse
      ? `Based on the following full audit report, generate a concise summary (max 300 words) that includes:
1. Overall score
2. Lighthouse Performance score (${lighthouse.performanceScore}/100) + LCP (${lighthouse.largestContentfulPaint})
3. Top 3 critical issues (one sentence each)
4. A teaser that makes them want to unlock the full report.

Format as Markdown. Do not include detailed fixes in the summary.

Full report:
${fullReport}`
      : `Based on the following full audit report, generate a concise summary (max 300 words) that includes:
1. Overall score
2. Top 3 critical issues (one sentence each)
3. A teaser that makes them want to unlock the full report.

Format as Markdown. Do not include detailed fixes in the summary.

Full report:
${fullReport}`;

    const summaryCompletion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 500,
      temperature: 0.3,
      messages: [{ role: 'user', content: summaryPrompt }],
    });

    const summary = summaryCompletion.choices[0].message.content;

    // ====== Step 6: Store report ======
    const reportId = 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    await storeReport(reportId, {
      url,
      summary,
      fullReport,
      htmlHead,        // NEW
      lighthouse,      // NEW
      createdAt: new Date().toISOString(),
      paid: false,
    });

    return res.status(200).json({
      reportId,
      summary,
      lighthouse,  // NEW: return to frontend
      htmlHead,    // NEW: return to frontend
    });

  } catch (err) {
    console.error('Audit error:', err);
    if (err.status === 401 || err.message?.includes('API key')) {
      return res.status(500).json({ error: 'API config error. Check DEEPSEEK_API_KEY.' });
    }
    return res.status(500).json({ error: 'Failed to generate audit. Please try again.', details: err.message });
  }
}

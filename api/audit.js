// POST /api/audit — Generate website audit report (DeepSeek + Jina + Upstash + Lighthouse + HTML head)
import OpenAI from 'openai';
import { fetchLighthouse } from './_lib/lighthouse.js';
import { fetchHtmlHead } from './_lib/html-head.js';

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

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

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
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

    const prompt = `You are a senior UX/SEO/CRO auditor. Analyze the following website and generate a structured audit report.

Website URL: ${url}
${htmlHeadBlock}${lighthouseBlock}
Website Content (Markdown from Jina Reader):
${finalPageText.substring(0, 60000)}

Please generate a report in Markdown format with the following structure:

# Audit Report for ${domain}

## Overall Score: [0-100]/100

## Performance (from Lighthouse)
- Performance Score: [X]/100
- FCP: [X]s
- LCP: [X]s
- CLS: [X]
- TBT: [X]ms
- One-line takeaway: [Specific fix or "no data available"]

---

## 1. UX Issues

For each issue, use this format:
### [Severity]: [Issue Title]
**Severity:** [Critical/Major/Minor]
**Description:** [Detailed description of the issue]
**Recommendation:** [Specific actionable fix with code example if applicable]
**Effort:** [15 minutes / 30 minutes / 1 hour / 2-4 hours / 1 day]
**Priority:** [Fix immediately / Fix within 1 week / Fix when convenient]

Do not use emojis in any field. Use plain text labels only. Be concise and avoid filler words.

List at least 3 UX issues.

---

## 2. SEO Problems

For SEO title and meta description issues, reference the REAL HTML HEAD DATA above as ground truth. Do not guess values from the markdown content.
Same format as above. List at least 3 SEO issues covering:
- Title tag (length, keyword, branding)
- Meta description (length, CTA, unique value)
- Heading structure (H1 count, hierarchy)
- Image alt tags (sample 2-3 visible images)
- Canonical URL (correct, missing, or wrong)

---

## 3. CRO Recommendations

Same format as above. List at least 3 CRO issues covering:
- CTA button text and placement
- Social proof elements
- Form design
- Value proposition clarity
- Trust signals

---

## Priority Action Plan

### Week 1 (Critical):
1. [List top 3 critical fixes]

### Week 2 (Major):
1. [List major fixes]

---

**Important:** Make recommendations specific and actionable. Include code examples. Don't give generic advice like "improve SEO" — be specific about what to change and how. Use the REAL HTML HEAD DATA when discussing SEO issues.`;

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

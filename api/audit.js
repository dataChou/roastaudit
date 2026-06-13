// POST /api/audit — Generate website audit report
import Anthropic from '@anthropic-ai/sdk';
import Firecrawl from '@mendable/firecrawl-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

// Helper: Store data (KV or fallback to global)
async function storeReport(reportId, data) {
  // Try Vercel KV first
  if (process.env.KV_URL) {
    try {
      const { kv } = await import('@vercel/kv');
      await kv.set(`report:${reportId}`, JSON.stringify(data), { ex: 86400 });
      return;
    } catch (err) {
      console.warn('KV store failed, falling back to memory:', err.message);
    }
  }

  // Fallback to process memory
  global.reports = global.reports || {};
  global.reports[reportId] = JSON.stringify(data);
}

// Helper: Get data (KV or fallback to global)
async function getReport(reportId) {
  if (process.env.KV_URL) {
    try {
      const { kv } = await import('@vercel/kv');
      const data = await kv.get(`report:${reportId}`);
      return data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
    } catch (err) {
      console.warn('KV get failed, falling back to memory:', err.message);
    }
  }

  // Fallback to process memory
  global.reports = global.reports || {};
  return global.reports[reportId] || null;
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
    // 1. Scrape website using Firecrawl
    let scrapedData = null;
    let screenshotUrl = null;

    try {
      const scrapeResult = await firecrawl.scrape(url, {
        formats: ['markdown', 'screenshot'],
      });

      if (scrapeResult && scrapeResult.success) {
        scrapedData = scrapeResult.data;
        screenshotUrl = scrapedData.screenshot || null;
      }
    } catch (scrapeErr) {
      console.warn('Firecrawl scrape failed:', scrapeErr.message);
    }

    // 2. If scraping failed, try to fetch HTML directly
    let pageText = '';

    if (scrapedData && scrapedData.markdown) {
      pageText = scrapedData.markdown;
    } else {
      try {
        const fetchRes = await fetch(url, {
          headers: { 'User-Agent': 'RoastAudit Bot/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const htmlContent = await fetchRes.text();
        pageText = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50000);
      } catch (fetchErr) {
        console.warn('Direct fetch failed:', fetchErr.message);
      }
    }

    if (!pageText) {
      return res.status(400).json({
        error: 'Unable to fetch website content. The site may be blocking crawlers or unavailable.',
      });
    }

    // 3. Call Claude API to generate audit report
    const prompt = `You are a senior UX/SEO/CRO auditor. Analyze the following website content and generate a structured audit report.

Website URL: ${url}

Website Content:
${pageText.substring(0, 60000)}

Please generate a report in Markdown format with the following structure:

# Audit Report for ${url.replace(/https?:\/\//, '').replace(/\/.*/, '')}

## Overall Score: [0-100]/100

---

## 1. UX Issues

For each issue, use this format:
### [Severity Emoji] [Severity]: [Issue Title]
**Severity:** [Critical/Major/Minor]
**Description:** [Detailed description of the issue]
**Recommendation:** [Specific actionable fix with code example if applicable]
**Effort:** [15 minutes / 30 minutes / 1 hour / 2-4 hours / 1 day]
**Priority:** [Fix immediately / Fix within 1 week / Fix when convenient]

List at least 3 UX issues.

---

## 2. SEO Problems

Same format as above. List at least 3 SEO issues covering:
- Title tags
- Meta descriptions
- Heading structure
- Alt tags
- Page speed factors visible in code

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

**Important:** Make recommendations specific and actionable. Include code examples. Don't give generic advice like "improve SEO" — be specific about what to change and how.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const fullReport = message.content[0].text;

    // 4. Generate summary
    const summaryPrompt = `Based on the following full audit report, generate a concise summary (max 300 words) that includes:
1. Overall score
2. Top 3 critical issues (one sentence each)
3. A teaser that makes them want to unlock the full report.

Format as Markdown. Do not include detailed fixes in the summary.

Full report:
${fullReport}`;

    const summaryMessage = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
    });

    const summary = summaryMessage.content[0].text;

    // 5. Store report
    const reportId = 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

    const reportData = {
      url,
      summary,
      fullReport,
      screenshotUrl,
      createdAt: new Date().toISOString(),
      paid: false,
    };

    await storeReport(reportId, reportData);

    return res.status(200).json({
      reportId,
      summary,
      screenshotUrl,
    });

  } catch (err) {
    console.error('Audit error:', err);
    return res.status(500).json({
      error: 'Failed to generate audit. Please try again.',
      details: err.message,
    });
  }
}

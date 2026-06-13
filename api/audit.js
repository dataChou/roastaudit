// POST /api/audit — Generate website audit report (DeepSeek + Jina + Upstash)
import OpenAI from 'openai';

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

async function getReport(reportId) {
  const result = await upstash('GET', [`report:${reportId}`]);
  if (!result || result.error) {
    console.warn('Upstash get failed:', result?.error);
    return null;
  }
  return result.result; // Upstash REST returns { result: "value" }
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
    // 1. Fetch website content via Jina Reader
    let pageText = '';
    let screenshotUrl = null;

    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          'Authorization': `Bearer ${process.env.JINA_API_KEY || ''}`,
          'Accept': 'text/markdown',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (jinaRes.ok) {
        pageText = await jinaRes.text();
      }
    } catch (jinaErr) {
      console.warn('Jina fetch failed:', jinaErr.message);
    }

    // 2. Fallback: direct HTML fetch
    if (!pageText || pageText.length < 200) {
      try {
        const fetchRes = await fetch(url, {
          headers: { 'User-Agent': 'RoastAudit Bot/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await fetchRes.text();
        pageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50000);
      } catch (fetchErr) {
        console.warn('Direct fetch failed:', fetchErr.message);
      }
    }

    if (!pageText || pageText.length < 100) {
      return res.status(400).json({
        error: 'Unable to fetch website content. The site may be blocking crawlers or unavailable.',
      });
    }

    // 3. Call DeepSeek to generate audit report
    const domain = url.replace(/https?:\/\//, '').replace(/\/.*/, '');
    const prompt = `You are a senior UX/SEO/CRO auditor. Analyze the following website content and generate a structured audit report.

Website URL: ${url}

Website Content (Markdown):
${pageText.substring(0, 60000)}

Please generate a report in Markdown format with the following structure:

# Audit Report for ${domain}

## Overall Score: [0-100]/100

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

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 6000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const fullReport = completion.choices[0].message.content;

    // 4. Generate summary
    const summaryCompletion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 500,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: `Based on the following full audit report, generate a concise summary (max 300 words) that includes:
1. Overall score
2. Top 3 critical issues (one sentence each)
3. A teaser that makes them want to unlock the full report.

Format as Markdown. Do not include detailed fixes in the summary.

Full report:
${fullReport}`,
      }],
    });

    const summary = summaryCompletion.choices[0].message.content;

    // 5. Store report in Upstash
    const reportId = 'audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    await storeReport(reportId, {
      url,
      summary,
      fullReport,
      screenshotUrl,
      createdAt: new Date().toISOString(),
      paid: false,
    });

    return res.status(200).json({ reportId, summary, screenshotUrl });

  } catch (err) {
    console.error('Audit error:', err);
    if (err.status === 401 || err.message?.includes('API key')) {
      return res.status(500).json({ error: 'API config error. Check DEEPSEEK_API_KEY.' });
    }
    return res.status(500).json({ error: 'Failed to generate audit. Please try again.', details: err.message });
  }
}

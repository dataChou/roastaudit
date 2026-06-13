// GET /api/report?id=xxx — Get report data (Upstash)

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const reportId = req.query.id;
  if (!reportId) {
    return res.status(400).json({ error: 'Missing report ID' });
  }

  try {
    const result = await upstash('GET', [`report:${reportId}`]);

    if (!result || result.error || !result.result) {
      return res.status(404).json({ error: 'Report not found or expired' });
    }

    const parsed = JSON.parse(result.result);

    const response = {
      reportId,
      url: parsed.url,
      paid: parsed.paid || false,
      summary: parsed.summary,
      screenshotUrl: parsed.screenshotUrl || null,
    };

    if (parsed.paid) {
      response.fullReport = parsed.fullReport;
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('Report fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}

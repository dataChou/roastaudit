// GET /api/report?id=xxx — Get report data

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const reportId = req.query.id;

  if (!reportId) {
    return res.status(400).json({ error: 'Missing report ID' });
  }

  try {
    const reportData = await getReport(reportId);

    if (!reportData) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const parsed = typeof reportData === 'string' ? JSON.parse(reportData) : reportData;

    // Return data based on payment status
    const response = {
      reportId,
      url: parsed.url,
      paid: parsed.paid || false,
      summary: parsed.summary,
      screenshotUrl: parsed.screenshotUrl || null,
    };

    // Only return full report if paid
    if (parsed.paid) {
      response.fullReport = parsed.fullReport;
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('Report fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}

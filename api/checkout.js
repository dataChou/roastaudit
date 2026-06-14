// POST /api/checkout — Demo mode: unlock report without real payment
// Also supports real Upstash storage when env vars present.
import { readDemoReport, markDemoReportPaid, productionDemoBlockReason } from './_lib/demo-mode.js';

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

  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'Missing reportId' });

  try {
    // Try demo memory store first (always works in demo mode)
    if (reportId.startsWith('demo-')) {
      const updated = markDemoReportPaid(reportId);
      if (!updated) {
        return res.status(404).json({ error: 'Report not found (demo store)' });
      }
      console.log(`[DEMO] Unlocked report ${reportId} in memory store`);
      return res.status(200).json({
        success: true,
        unlocked: true,
        reportId,
      });
    }

    // Fallback: Upstash (for real audit reports with non-demo IDs)
    const result = await upstash('GET', [`report:${reportId}`]);
    if (!result || result.error || !result.result) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportData = JSON.parse(result.result);
    reportData.paid = true;

    await upstash('SETEX', [`report:${reportId}`, '86400', JSON.stringify(reportData)]);

    return res.status(200).json({
      success: true,
      unlocked: true,
      reportId,
    });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to unlock report' });
  }
}

// POST /api/webhook/lemonsqueezy — Handle LemonSqueezy payment webhooks

// Helper: Store data (KV or fallback to global)
async function storeReport(reportId, data) {
  if (process.env.KV_URL) {
    try {
      const { kv } = await import('@vercel/kv');
      await kv.set(`report:${reportId}`, JSON.stringify(data), { ex: 86400 });
      return;
    } catch (err) {
      console.warn('KV store failed, falling back to memory:', err.message);
    }
  }

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

  global.reports = global.reports || {};
  return global.reports[reportId] || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventName = event.meta?.event_name;

    console.log('Webhook received:', eventName);

    if (eventName === 'order_created') {
      const reportId = event.meta?.custom_data?.report_id;

      if (reportId) {
        const reportData = await getReport(reportId);
        if (reportData) {
          const parsed = typeof reportData === 'string' ? JSON.parse(reportData) : reportData;
          parsed.paid = true;
          await storeReport(reportId, parsed);
          console.log('Report marked as paid:', reportId);
        }
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

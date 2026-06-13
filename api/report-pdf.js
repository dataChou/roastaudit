// GET /api/report/:id/pdf — Generate PDF for a report
// Full implementation in Task #33

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'PDF endpoint — to be implemented in Task #33'
  });
}

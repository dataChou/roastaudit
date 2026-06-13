// POST /api/audit — Trigger a website audit
// Full implementation in Task #32

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Audit endpoint — to be implemented in Task #32'
  });
}

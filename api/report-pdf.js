// GET /api/report-pdf?reportId=xxx — Generate PDF report (Upstash + demo memory store fallback)
import { readDemoReport, productionDemoBlockReason } from './_lib/demo-mode.js';

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

  // ===== Production safety: refuse demo mode in production =====
  const blockReason = productionDemoBlockReason();
  if (blockReason) {
    console.error(`FATAL [${req.url}]: ${blockReason}`);
    return res.status(500).json({ error: 'Service configuration error. Please contact support.' });
  }

  const reportId = req.query.reportId;

  if (!reportId) {
    return res.status(400).json({ error: 'Missing reportId' });
  }

  try {
    let parsed = null;

    // Try demo memory store first
    if (reportId.startsWith('demo-')) {
      parsed = readDemoReport(reportId);
      if (!parsed) {
        return res.status(404).json({ error: 'Report not found (demo store)' });
      }
    } else {
      // Fallback: Upstash
      const result = await upstash('GET', [`report:${reportId}`]);
      if (!result || result.error || !result.result) {
        return res.status(404).json({ error: 'Report not found or expired' });
      }
      parsed = JSON.parse(result.result);
    }

    if (!parsed.paid) {
      return res.status(403).json({ error: 'Report not paid' });
    }

    // For JSON format request (used by frontend to get full report)
    if (req.query.format === 'json') {
      return res.status(200).json({
        fullReport: parsed.fullReport,
        summary: parsed.summary,
        url: parsed.url,
        htmlHead: parsed.htmlHead,
        lighthouse: parsed.lighthouse,
      });
    }

    // Generate PDF
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="roastaudit-${reportId}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Cover page
    doc.fontSize(28).text('RoastAudit', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).text('Website Audit Report', { align: 'center' });
    doc.moveDown(2);

    // URL
    const displayUrl = parsed.url || 'unknown';
    const domain = displayUrl.replace(/https?:\/\//, '').replace(/\/.*/, '');
    doc.fontSize(14).text(`Audited URL: ${domain}`, { align: 'center' });
    doc.fontSize(10).text(`Full URL: ${displayUrl}`, { align: 'center' });
    doc.moveDown(0.5);
    const createdDate = parsed.createdAt ? new Date(parsed.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
    doc.fontSize(10).text(`Date: ${createdDate}`, { align: 'center' });

    doc.moveDown(3);

    // Parse and render report content (clean LLM artifacts first)
    const reportText = (parsed.fullReport || parsed.summary || '')
      .replace(/!\s*'+/g, '!')          // "Now !'" -> "Now!"
      .replace(/'\s*\}/g, '}')          // stray quotes before }
      .replace(/\u{1F300}-\u{1FAFF}|\u{2600}-\u{27BF}/gu, '');  // strip emoji

    const lines = reportText.split('\n');

    for (const line of lines) {
      if (line.startsWith('# ')) {
        doc.moveDown(1);
        doc.fontSize(20).text(line.substring(2), { align: 'left' });
        doc.moveDown(0.5);
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.8);
        doc.fontSize(16).text(line.substring(3), { align: 'left' });
        doc.moveDown(0.3);
      } else if (line.startsWith('### ')) {
        doc.moveDown(0.5);
        doc.fontSize(13).text(line.substring(4), { align: 'left' });
      } else if (line.startsWith('**') && line.endsWith('**')) {
        const boldText = line.substring(2, line.length - 2);
        doc.fontSize(10).text(boldText, { continued: false });
      } else if (line.startsWith('- ')) {
        doc.fontSize(10).text(`• ${line.substring(2)}`, { indent: 20 });
      } else if (line.startsWith('---')) {
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
      } else if (line.trim() === '') {
        doc.moveDown(0.3);
      } else {
        // Skip code blocks and other complex markdown for simplicity
        if (!line.startsWith('`') && !line.startsWith('```')) {
          doc.fontSize(10).text(line, { align: 'left' });
        }
      }
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).text('Generated by RoastAudit — roastaudit.com', { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  }
}

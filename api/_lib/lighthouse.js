// api/_lib/lighthouse.js — Google PageSpeed Insights (Lighthouse) fetcher
// Must-6 (Gate 3.5, 2026-06-13)

export async function fetchLighthouse(url) {
  try {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    const res = await fetch(psiUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const categories = data?.lighthouseResult?.categories;
    const audits = data?.lighthouseResult?.audits;

    if (!categories?.performance || !audits) return null;

    return {
      performanceScore: Math.round((categories.performance.score || 0) * 100),
      firstContentfulPaint: audits['first-contentful-paint']?.displayValue || 'N/A',
      largestContentfulPaint: audits['largest-contentful-paint']?.displayValue || 'N/A',
      cumulativeLayoutShift: audits['cumulative-layout-shift']?.displayValue || 'N/A',
      totalBlockingTime: audits['total-blocking-time']?.displayValue || 'N/A',
    };
  } catch (err) {
    console.warn('Lighthouse fetch failed:', err.message);
    return null;
  }
}

// api/_lib/lighthouse.js — Google PageSpeed Insights (Lighthouse) fetcher
// Must-6 (Gate 3.5, 2026-06-13)
import { isDemoMode } from './demo-mode.js';

export async function fetchLighthouse(url) {
  // Defensive: if demo mode, return mock data (normal flow bypasses this via audit.js)
  if (isDemoMode()) {
    return {
      performanceScore: 85,
      firstContentfulPaint: '1.6 s',
      largestContentfulPaint: '2.8 s',
      cumulativeLayoutShift: '0.06',
      totalBlockingTime: '180 ms',
    };
  }
  try {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
    console.log(`[Lighthouse] Calling PSI for ${url}`);
    const res = await fetch(psiUrl, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.warn(`[Lighthouse] PSI returned HTTP ${res.status} for ${url}`);
      return null;
    }

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
    console.warn(`[Lighthouse] Failed for ${url}: ${err.message}`);
    return null;
  }
}

// POST /api/checkout — Create LemonSqueezy checkout session
import { kv } from '@vercel/kv';

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
const LEMONSQUEEZY_VARIANT_SINGLE = process.env.LEMONSQUEEZY_VARIANT_SINGLE;
const SITE_URL = process.env.SITE_URL || 'https://roastaudit.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { reportId, variantId } = req.body;

  if (!reportId) {
    return res.status(400).json({ error: 'Missing reportId' });
  }

  const variant = variantId || LEMONSQUEEZY_VARIANT_SINGLE;

  try {
    const checkoutData = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: {
            embed: false,
            media: false,
          },
          checkout_data: {
            custom: {
              report_id: reportId,
            },
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: LEMONSQUEEZY_STORE_ID,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variant,
            },
          },
        },
      },
    };

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
      },
      body: JSON.stringify(checkoutData),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('LemonSqueezy checkout error:', result);
      return res.status(500).json({ error: 'Failed to create checkout' });
    }

    const checkoutUrl = result.data.attributes.url;

    return res.status(200).json({
      checkoutUrl,
      reportId,
    });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout' });
  }
}

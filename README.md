# RoastAudit

AI-powered website audit tool that analyzes UX, SEO, and CRO issues. Pay $4.99 per report, no subscription.

## Features

- **3-Dimensional Audit**: UX + SEO + CRO analysis
- **Claude AI Powered**: Uses Claude 3.5 Sonnet for deep analysis
- **Screenshots**: Desktop and mobile views
- **PDF Export**: Download branded PDF reports
- **Pay-per-report**: $4.99 via LemonSqueezy, no login required

## Tech Stack

- **Frontend**: Single-file HTML + Tailwind CSS + Vanilla JS
- **Backend**: Vercel Functions (Node.js)
- **AI**: Anthropic Claude 3.5 Sonnet
- **Crawler**: Firecrawl API
- **Storage**: Vercel KV (Redis-compatible)
- **Payment**: LemonSqueezy
- **PDF**: pdfkit

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Fill in `.env.local` with your API keys (see Environment Variables below)

4. Run locally:
```bash
npm run dev
```

This starts Vercel CLI dev server at `http://localhost:3000`.

## Deployment

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel deploy
```

3. Set environment variables in Vercel Dashboard (Project Settings > Environment Variables)

4. For production deployment:
```bash
vercel --prod
```

## Environment Variables

Create `.env.local` from `.env.example`:

```
# Anthropic (Claude 3.5 Sonnet)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# Firecrawl (website crawler + screenshots)
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxx

# LemonSqueezy (payment)
LEMONSQUEEZY_API_KEY=eyJxxxxxxxxxxxxxxxx
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
LEMONSQUEEZY_VARIANT_SINGLE=123456
LEMONSQUEEZY_VARIANT_5PACK=789012

# Vercel KV (required for production)
KV_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_URL=https://xxx.kv.vercel-storage.com
KV_REST_API_TOKEN=xxxxxxxx
KV_REST_API_READ_ONLY_TOKEN=xxxxxxxx

# Site config
SITE_URL=https://roastaudit.com
```

## Getting API Keys

### Anthropic API Key
1. Go to https://console.anthropic.com
2. Create an account and generate an API key

### Firecrawl API Key
1. Go to https://firecrawl.dev
2. Sign up and get your API key from dashboard

### LemonSqueezy
1. Go to https://lemonsqueezy.com
2. Create a store
3. Create products: Single Audit ($4.99) and 5-Pack ($19)
4. Get variant IDs from product settings
5. Generate API key from Settings > API
6. Set webhook endpoint: `https://your-domain.com/api/webhook/lemonsqueezy`

### Vercel KV
1. Go to Vercel Dashboard
2. Select your project
3. Go to Storage > Create Database > KV
4. Copy the environment variables to your project

## Known Limitations

- Requires Vercel KV for production (stores reports)
- Firecrawl has ~60% success rate on Cloudflare-protected sites
- No user accounts (all state via report IDs)
- English websites only (v1)

## Project Structure

```
roastaudit/
├── index.html          # Single-page app (UI + logic)
├── api/
│   ├── audit.js       # Main audit endpoint (Claude + Firecrawl)
│   ├── checkout.js    # LemonSqueezy checkout creation
│   ├── webhook.js    # Payment webhook handler
│   └── report-pdf.js # PDF generation endpoint
├── vercel.json        # Vercel deployment config
├── package.json       # Dependencies
└── .env.example       # Environment variable template
```

## License

MIT

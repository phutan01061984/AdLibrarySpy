# 🕵️ AdLibrarySpy

**Meta Ad Library Scraper & Competitive Intelligence Dashboard**

Scrape Meta Ad Library data, hash thumbnails with perceptual hashing (dHash), and analyze competitor ad strategies — all in one Next.js app, deployable on Vercel.

---

## ✨ Features

- **5 Pivot Table Views**: Library ID, Creative ID, Weekly Trend, By Variant Count, Analysis Dashboard
- **Perceptual Image Hashing (dHash)**: Group similar ad creatives automatically
- **Win Detection**: High variant count = winning creative 🏆
- **Manual Import**: Paste JSON data from any source
- **Weekly Snapshots**: Track ad strategy changes over time
- **Keyword Analysis**: Extract top keywords from ad copy
- **Brand Comparison**: Compare two competitor strategies side-by-side
- **Dark Intelligence Theme**: Premium spy-inspired UI

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:4001**

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FACEBOOK_ACCESS_TOKEN` | Meta Graph API token | For API scraping |
| `DEFAULT_COUNTRY` | Default country code | No (default: VN) |

## 📐 Architecture

Single Next.js app with API Routes — no separate backend needed.

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Dashboard UI
├── globals.css             # Dark spy theme
└── api/
    ├── brands/route.ts     # GET/POST brands
    ├── brands/[id]/        # DELETE brand
    ├── scrape/[brandId]/   # POST scrape from API
    ├── hash/[brandId]/     # POST hash thumbnails
    ├── import/[brandId]/   # POST import JSON data
    ├── ads/[brandId]/      # GET ads list
    ├── pivot/[brandId]/    # GET pivot table data
    ├── analysis/[brandId]/ # GET analysis data
    ├── compare/            # GET compare brands
    ├── snapshots/[brandId]/# GET/POST snapshots
    ├── settings/           # GET/POST settings
    └── status/             # GET system status
lib/
├── config.js               # Settings & paths (Vercel-aware)
├── scraper.js              # Facebook Graph API v19
├── hasher.js               # dHash perceptual hashing
├── storage.js              # JSON file storage
└── analyzer.js             # Creative grouping & intelligence
```

## ▲ Deploy on Vercel

1. Push to GitHub
2. Import repo on [vercel.com/new](https://vercel.com/new)
3. Set environment variable: `FACEBOOK_ACCESS_TOKEN`
4. Deploy!

> **Note**: File-based storage uses `/tmp` on Vercel (ephemeral). For persistent data in production, add a database (Vercel KV, Supabase, etc.)

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 |
| Styling | Tailwind CSS 4 |
| Image Hash | sharp (dHash algorithm) |
| Storage | JSON files (local) / /tmp (Vercel) |

## 📄 License
MIT

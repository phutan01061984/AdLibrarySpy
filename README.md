# 🕵️ AdLibrarySpy

**Meta Ad Library Scraper & Competitive Intelligence Dashboard**

Cào dữ liệu từ Meta Ad Library, băm thumbnail để nhóm creative, phân tích chiến lược quảng cáo đối thủ.

---

## ✨ Features

### 📊 Pivot Table Views
- **Library ID by Brand** — Tất cả ads theo brand
- **Creative ID by Brand** — Nhóm creative (dHash)
- **Creative ID by Week** — Trend theo tuần
- **Creative By # of Ads** — Phát hiện ads win (variant count cao = creative hiệu quả)
- **Analysis Dashboard** — Tổng quan: stats, top creatives, format distribution, keywords

### 🔍 Creative Hashing (dHash)
- Băm thumbnail image thành fingerprint (16 hex chars)
- Creative ID format: `{brand}-{hash[:6]}` (VD: `ILAVietnam-fffec0`)
- Cùng visual = cùng hash, bất kể resize/compress
- Hamming distance để so sánh similarity

### 📈 Competitive Intelligence
- **Win Detection**: Creative được nhân bản nhiều = creative win 🏆
- **Weekly Tracking**: Snapshots tuần để theo dõi trend
- **Keyword Analysis**: Top keywords trong ad copy
- **Format Distribution**: Phân bổ Image/Video/Carousel
- **Active Monitoring**: Ads đang chạy vs đã tắt

### 📥 Data Collection
- **API Scraping**: Facebook Graph API v19 (cần Access Token)
- **Manual Import**: Paste JSON data (từ browser hay tool khác)
- **Thumbnail Hashing**: Download + dHash thumbnails

---

## 🚀 Quick Start

```bash
# Install dependencies
npm run setup

# Start dev (Backend :4000 + Frontend :4001)
npm run dev
```

Mở **http://localhost:4001**

## 🔑 Setup Facebook Token

1. Vào [developers.facebook.com](https://developers.facebook.com/)
2. Tạo App → Get Access Token
3. Paste token vào Settings trong app

## 📐 Architecture

```
┌─────────────────┐    Graph API v19    ┌──────────────┐
│  Meta Ad Library │ ◄──────────────── │  server.js   │
│  (facebook.com)  │                    │  :4000 API   │
└─────────────────┘                     └──────┬───────┘
                                               │
     ┌──────────────┐                   ┌──────┴───────┐
     │  dHash Engine │ ◄── thumbnail ──│  Next.js     │
     │  (sharp)      │                 │  :4001 UI    │
     └──────────────┘                   └──────────────┘
```

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 4 |
| Image Hash | sharp (dHash algorithm) |
| Storage | JSON files (per-brand) |
| Frontend | Next.js 16 + React 19 |
| Styling | Tailwind CSS 4 |

---

## 📄 License
MIT

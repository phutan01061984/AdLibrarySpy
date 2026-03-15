import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', '@sparticuz/chromium', 'puppeteer-core', 'puppeteer'],
  // Increase function timeout for scraping (Vercel Pro: up to 60s)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;

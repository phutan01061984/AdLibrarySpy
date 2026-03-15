import { NextRequest, NextResponse } from 'next/server';
const { getBrandData } = require('@/lib/storage');
const { scrapeFromApi } = require('@/lib/scraper');
const { scrapeAdLibraryPage, isWebScrapeAvailable } = require('@/lib/web-scraper');
const { getSettings } = require('@/lib/config');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const data = getBrandData(brandId);
  const body = await request.json().catch(() => ({}));
  const settings = getSettings();

  // Determine scraping method
  const method = body.method || 'auto'; // 'auto' | 'api' | 'web'

  try {
    // Method: API (requires Facebook token)
    if (method === 'api') {
      if (!settings.facebookAccessToken) {
        return NextResponse.json(
          { error: 'Facebook Access Token required for API mode. Use "web" mode instead (no token needed).' },
          { status: 400 }
        );
      }
      if (!data.pageId) {
        return NextResponse.json(
          { error: 'Brand has no pageId configured.' },
          { status: 400 }
        );
      }
      const result = await scrapeFromApi(data.pageId, brandId, {
        country: body.country,
        limit: body.limit,
        after: body.after,
      });
      return NextResponse.json(result);
    }

    // Method: Web scrape (no token needed)
    if (method === 'web' || method === 'auto') {
      if (!isWebScrapeAvailable()) {
        return NextResponse.json({
          error: 'Web scraping not available. Install Puppeteer: npm install puppeteer\nNote: Only works locally, not on Vercel.',
          hint: 'Run locally with "npm run dev" and install puppeteer',
        }, { status: 400 });
      }

      const searchTerm = data.name || brandId;
      const result = await scrapeAdLibraryPage(searchTerm, brandId, {
        country: body.country || settings.defaultCountry || 'VN',
        pageId: data.pageId || null,
        maxScrolls: body.maxScrolls || 15,
        headless: body.headless !== false, // default headless
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown method: ${method}` }, { status: 400 });

  } catch (e: any) {
    console.error(`[Scrape] Error:`, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: Check scraping status/capabilities
export async function GET() {
  const settings = getSettings();
  return NextResponse.json({
    webScrapeAvailable: isWebScrapeAvailable(),
    apiAvailable: !!settings.facebookAccessToken,
    recommendation: isWebScrapeAvailable()
      ? 'web'
      : settings.facebookAccessToken
        ? 'api'
        : 'none',
  });
}

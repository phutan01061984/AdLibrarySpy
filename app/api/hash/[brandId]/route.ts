import { NextRequest, NextResponse } from 'next/server';
const { getBrandData, saveBrandData } = require('@/lib/storage');
const { hashBrandThumbnails } = require('@/lib/scraper');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  
  // Try to get ads from request body first (localStorage mode)
  let ads: any[] = [];
  try {
    const body = await request.json();
    if (body.ads && Array.isArray(body.ads) && body.ads.length > 0) {
      ads = body.ads;
    }
  } catch {}

  // Fallback to server storage
  if (ads.length === 0) {
    const data = getBrandData(brandId);
    ads = data.ads || [];
  }

  if (ads.length === 0) {
    return NextResponse.json(
      { error: 'No ads to hash. Scrape or import data first.' },
      { status: 400 }
    );
  }

  try {
    const result = await hashBrandThumbnails(brandId, ads);
    return NextResponse.json({ ...result, updatedAds: ads, totalAds: ads.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

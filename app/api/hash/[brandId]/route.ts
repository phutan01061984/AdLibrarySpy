import { NextRequest, NextResponse } from 'next/server';
const { getBrandData, saveBrandData } = require('@/lib/storage');
const { hashBrandThumbnails } = require('@/lib/scraper');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const data = getBrandData(brandId);

  if (!data.ads || data.ads.length === 0) {
    return NextResponse.json(
      { error: 'No ads to hash. Scrape or import data first.' },
      { status: 400 }
    );
  }

  try {
    const result = await hashBrandThumbnails(brandId, data.ads);
    saveBrandData(brandId, data);
    return NextResponse.json({ ...result, totalAds: data.ads.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

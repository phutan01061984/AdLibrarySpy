import { NextRequest, NextResponse } from 'next/server';
const { getBrandData } = require('@/lib/storage');
const { scrapeFromApi } = require('@/lib/scraper');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const data = getBrandData(brandId);

  if (!data.pageId) {
    return NextResponse.json(
      { error: 'Brand has no pageId configured. Edit brand first.' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await scrapeFromApi(data.pageId, brandId, {
      country: body.country,
      limit: body.limit,
      after: body.after,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

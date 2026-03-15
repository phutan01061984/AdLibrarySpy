import { NextRequest, NextResponse } from 'next/server';
const { hashBrandThumbnails } = require('@/lib/scraper');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  
  // Get ads from request body (localStorage mode)
  let ads: any[] = [];
  try {
    const body = await request.json();
    if (body.ads && Array.isArray(body.ads) && body.ads.length > 0) {
      ads = body.ads;
    }
  } catch {}

  if (ads.length === 0) {
    return NextResponse.json(
      { error: 'No ads to hash. Scrape or import data first.' },
      { status: 400 }
    );
  }

  // Count ads with thumbnails before hashing
  const withThumbnail = ads.filter(a => a.thumbnailUrl).length;
  const alreadyHashed = ads.filter(a => a.creativeId).length;
  const toHash = ads.filter(a => !a.creativeId && a.thumbnailUrl).length;

  console.log(`[Hash API] Brand: ${brandId}, Total: ${ads.length}, ` +
    `withThumbnail: ${withThumbnail}, alreadyHashed: ${alreadyHashed}, toHash: ${toHash}`);

  if (toHash === 0) {
    return NextResponse.json({
      hashed: 0,
      failed: 0,
      totalAds: ads.length,
      withThumbnail,
      alreadyHashed,
      updatedAds: ads,
      message: withThumbnail === 0
        ? 'No ads have thumbnail images. Re-scrape to capture thumbnails.'
        : 'All ads with thumbnails are already hashed.',
    });
  }

  try {
    const result = await hashBrandThumbnails(brandId, ads);
    return NextResponse.json({
      ...result,
      updatedAds: ads,
      totalAds: ads.length,
      withThumbnail,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

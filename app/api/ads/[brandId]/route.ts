import { NextRequest, NextResponse } from 'next/server';
const { getBrandData } = require('@/lib/storage');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const data = getBrandData(brandId);
  const searchParams = request.nextUrl.searchParams;

  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const start = (page - 1) * pageSize;

  let ads = data.ads || [];

  if (searchParams.get('active') === 'true') ads = ads.filter((a: any) => a.isActive);
  if (searchParams.get('active') === 'false') ads = ads.filter((a: any) => !a.isActive);

  const sortBy = searchParams.get('sortBy') || 'lastSeenAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  ads.sort((a: any, b: any) => {
    const aVal = a[sortBy] || '';
    const bVal = b[sortBy] || '';
    return sortOrder === 'desc'
      ? String(bVal).localeCompare(String(aVal))
      : String(aVal).localeCompare(String(bVal));
  });

  return NextResponse.json({
    total: ads.length,
    page,
    pageSize,
    ads: ads.slice(start, start + pageSize),
  });
}

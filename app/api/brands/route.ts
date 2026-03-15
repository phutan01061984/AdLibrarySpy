import { NextRequest, NextResponse } from 'next/server';
const { getBrands, getBrandData, saveBrandData } = require('@/lib/storage');

export async function GET() {
  return NextResponse.json(getBrands());
}

export async function POST(request: NextRequest) {
  const { name, pageId } = await request.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const brandId = name.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
  const data = getBrandData(brandId);
  data.name = name;
  data.pageId = pageId || '';
  if (!data.ads) data.ads = [];
  saveBrandData(brandId, data);

  return NextResponse.json({ brandId, name, pageId: pageId || '' });
}

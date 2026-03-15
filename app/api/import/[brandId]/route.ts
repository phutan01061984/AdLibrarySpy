import { NextRequest, NextResponse } from 'next/server';
const { importManualData } = require('@/lib/scraper');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const { ads } = await request.json();

  if (!ads || !Array.isArray(ads)) {
    return NextResponse.json({ error: 'ads array is required' }, { status: 400 });
  }

  try {
    const result = importManualData(brandId, ads);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

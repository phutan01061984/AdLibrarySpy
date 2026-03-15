import { NextRequest, NextResponse } from 'next/server';
const { analyzeBrand } = require('@/lib/analyzer');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  try {
    const result = analyzeBrand(brandId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

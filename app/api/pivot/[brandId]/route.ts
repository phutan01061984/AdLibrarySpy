import { NextRequest, NextResponse } from 'next/server';
const { getPivotData } = require('@/lib/analyzer');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  try {
    const searchParams = request.nextUrl.searchParams;
    const options: Record<string, string> = {};
    searchParams.forEach((value, key) => { options[key] = value; });
    const result = getPivotData(brandId, options);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

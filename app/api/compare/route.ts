import { NextRequest, NextResponse } from 'next/server';
const { compareBrands } = require('@/lib/analyzer');

export async function GET(request: NextRequest) {
  const brand1 = request.nextUrl.searchParams.get('brand1');
  const brand2 = request.nextUrl.searchParams.get('brand2');

  if (!brand1 || !brand2) {
    return NextResponse.json({ error: 'brand1 and brand2 query params required' }, { status: 400 });
  }

  try {
    return NextResponse.json(compareBrands(brand1, brand2));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

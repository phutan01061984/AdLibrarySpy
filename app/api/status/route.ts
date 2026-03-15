import { NextResponse } from 'next/server';
const { getBrands } = require('@/lib/storage');
const { getSettings } = require('@/lib/config');

export async function GET() {
  const brands = getBrands();
  const settings = getSettings();
  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    brands: brands.length,
    totalAds: brands.reduce((sum: number, b: any) => sum + b.adsCount, 0),
    hasToken: !!settings.facebookAccessToken,
  });
}

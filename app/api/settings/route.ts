import { NextRequest, NextResponse } from 'next/server';
const { getSettings, saveSettings } = require('@/lib/config');

export async function GET() {
  const settings = getSettings();
  if (settings.facebookAccessToken) {
    settings.facebookAccessTokenMasked = settings.facebookAccessToken.substring(0, 10) + '***';
  }
  return NextResponse.json(settings);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = saveSettings(body);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

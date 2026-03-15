import { NextRequest, NextResponse } from 'next/server';
const { hashFromUrl } = require('@/lib/hasher');

export async function POST(request: NextRequest) {
  const { url } = await request.json();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  try {
    const result = await hashFromUrl(url);
    if (result) {
      return NextResponse.json({ hash: result.hash, size: result.size });
    }
    return NextResponse.json({ error: 'Failed to hash image' }, { status: 500 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

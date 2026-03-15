import { NextRequest, NextResponse } from 'next/server';
const { saveSnapshot, getSnapshots } = require('@/lib/storage');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  return NextResponse.json(getSnapshots(brandId));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  try {
    const snapshot = saveSnapshot(brandId);
    return NextResponse.json(snapshot);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

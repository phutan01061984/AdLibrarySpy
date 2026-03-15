import { NextRequest, NextResponse } from 'next/server';
const { deleteBrand } = require('@/lib/storage');

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteBrand(id);
  return NextResponse.json({ deleted });
}

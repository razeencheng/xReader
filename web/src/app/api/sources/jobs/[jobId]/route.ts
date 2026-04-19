import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'complete', imported: 2, errors: [] });
}

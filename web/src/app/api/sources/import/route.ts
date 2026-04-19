import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ job_id: 'mock-job-001' }, { status: 201 });
}

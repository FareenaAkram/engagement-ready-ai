import { NextResponse } from 'next/server';
import { getAIAnalysis } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getAIAnalysis();
  return NextResponse.json(data);
}

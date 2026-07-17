import { NextResponse } from 'next/server';
import { getDashboardData } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}

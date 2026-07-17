import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/services/dashboard-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getSettings();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const data = await saveSettings(body);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: true, message, pipelineStage: 'failed' }, { status: 400 });
  }
}

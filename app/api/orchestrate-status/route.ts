import { NextResponse } from 'next/server';
import { getOrchestrateStatus } from '@/services/orchestrate-service';
import { hasICAAgenticConfig, appEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: getOrchestrateStatus(),
    configured: hasICAAgenticConfig(),
    agentId: appEnv.icaAgentId,
    appId: appEnv.icaAgenticAppId,
    langflowUrl: appEnv.icaLangflowUrl,
    route: 'langflow-primary / ica-mcp-fallback',
  });
}

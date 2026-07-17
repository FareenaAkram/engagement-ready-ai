import { type NextRequest, NextResponse } from 'next/server';
import { generateICAAsset } from '@/services/ica-generate-service';
import { persistOnDemandAsset } from '@/lib/workflow-state';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import type { ICAGenerateRequest } from '@/types/domain';

// Lighter single-asset Granite call, meant for interactive clicking across
// 18 asset types — a higher ceiling than the full pipeline routes.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60_000;

/**
 * POST /api/ica-generate
 *
 * On-demand ICA consulting artefact generator.
 * Accepts: { assetType, analysisSnapshot }
 * Returns: { data: ICAGenerateResult, generatedAt }
 *
 * The generated asset is persisted to workflow state so it survives page refresh.
 * This endpoint does NOT re-run the full 3-agent readiness pipeline.
 * It takes the existing readiness assessment as input and generates a
 * single focused consulting artefact using IBM Granite.
 *
 * Architecture:
 *   Context Studio = Engagement Knowledge (already captured in assessment)
 *   watsonx.ai = this single focused Granite call
 *   ICA = the artefact being generated (for delivery/export)
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`ica-generate:${clientKey(req)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many generation requests — try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await req.json()) as ICAGenerateRequest;

    if (!body.assetType || !body.analysisSnapshot) {
      return NextResponse.json(
        { error: true, message: 'assetType and analysisSnapshot are required.' },
        { status: 400 },
      );
    }

    const result = await generateICAAsset(body);
    persistOnDemandAsset(result);

    return NextResponse.json({
      data: result,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    console.error('[api/ica-generate] Error:', message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}

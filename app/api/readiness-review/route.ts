import { NextResponse } from 'next/server';
import { submitReadinessReview } from '@/services/dashboard-service';
import { extractTextFromBuffer, appendExtractedFiles } from '@/services/file-extraction-service';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import type { ReviewRequestInput } from '@/types/domain';

export const dynamic = 'force-dynamic';

// Defends against runaway watsonx cost/latency from oversized paste-ins, and
// caps the blast radius of prompt-injection attempts riding along in pasted
// "discovery notes" — this field is treated as untrusted input, not as a
// trusted instruction channel.
const MAX_PROJECT_CONTEXT_CHARS = 60_000;

// This route runs the full 3-agent watsonx pipeline — real, metered IBM API
// calls. 10 submissions per 5 minutes per caller is generous for a human
// consultant iterating, tight enough to stop a scripted loop from burning quota.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 5 * 60_000;

export async function POST(request: Request) {
  const rl = checkRateLimit(`readiness-review:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many assessments submitted — try again in ${rl.retryAfterSeconds}s.`, pipelineStage: 'failed' as const },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    let body: ReviewRequestInput;

    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // ── File upload path ─────────────────────────────────────────────────────
      // Clients send: FormData with fields matching ReviewRequestInput keys,
      // plus optional file entries (key = "file", repeated for each file).
      const formData = await request.formData();

      const projectContext = (formData.get('projectContext') as string | null) ?? '';
      const consultantComment = (formData.get('consultantComment') as string | null) ?? undefined;
      const evidenceType = (formData.get('evidenceType') as string | null) ?? undefined;
      const engagementName = (formData.get('engagementName') as string | null) ?? undefined;
      const clientName = (formData.get('clientName') as string | null) ?? undefined;
      const leadConsultant = (formData.get('leadConsultant') as string | null) ?? undefined;

      // Extract text from every uploaded file
      const fileEntries = formData.getAll('file') as File[];
      const extractions: Array<{ text: string; label: string }> = [];

      for (const file of fileEntries) {
        if (!(file instanceof File)) continue;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const result = await extractTextFromBuffer(buffer, file.type, file.name);
        if (result.text) {
          extractions.push(result);
          console.log(`[readiness-review] Extracted ${result.text.length} chars from "${file.name}"`);
        }
      }

      // Append extracted file text to whatever was pasted in the textarea
      const enrichedContext = appendExtractedFiles(projectContext, extractions);

      body = {
        projectContext: enrichedContext,
        consultantComment,
        evidenceType: evidenceType as ReviewRequestInput['evidenceType'],
        engagementName,
        clientName,
        leadConsultant,
      };
    } else {
      // ── JSON path (existing behaviour — no change) ───────────────────────────
      body = (await request.json()) as ReviewRequestInput;
    }

    if (body.projectContext.length > MAX_PROJECT_CONTEXT_CHARS) {
      return NextResponse.json(
        {
          error: true,
          message: `Discovery notes are too long (${body.projectContext.length.toLocaleString()} characters, max ${MAX_PROJECT_CONTEXT_CHARS.toLocaleString()}). Trim the pasted content or split it across a follow-up assessment.`,
          pipelineStage: 'failed' as const,
        },
        { status: 413 },
      );
    }

    const result = await submitReadinessReview(body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error.';
    console.error('[readiness-review] Unhandled error:', message);
    return NextResponse.json(
      { error: true, message, pipelineStage: 'failed' as const },
      { status: 500 },
    );
  }
}

/**
 * GET /api/ica-package/[engagementId]
 *
 * Exposes the engagement package JSON that ica-service.ts writes to disk
 * after every HITL decision. This is the endpoint the ICA Agentic App
 * (id: 92690bf8-bb58-4b1e-9241-f8af02aa89ce) pulls from automatically
 * when an assessment completes.
 *
 * Delivery chain:
 *   Your app → HITL decision → ica-service writes .next/tmp/ica-packages/{id}.json
 *   ICA Agentic App → GET /api/ica-package/{id} → processes package via YAML orchestration
 *
 * Also accepts "latest" as engagementId to return the most recently written package.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PACKAGES_DIR = path.join(process.cwd(), '.next', 'tmp', 'ica-packages');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ engagementId: string }> },
) {
  const { engagementId } = await params;

  try {
    let filePath: string;

    if (engagementId === 'latest') {
      // Return the most recently written package
      if (!fs.existsSync(PACKAGES_DIR)) {
        return NextResponse.json(
          { error: true, message: 'No packages found — run an assessment first.' },
          { status: 404 },
        );
      }
      const files = fs
        .readdirSync(PACKAGES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(PACKAGES_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) {
        return NextResponse.json(
          { error: true, message: 'No packages found — run an assessment first.' },
          { status: 404 },
        );
      }
      filePath = path.join(PACKAGES_DIR, files[0].name);
    } else {
      filePath = path.join(PACKAGES_DIR, `${engagementId}.json`);
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: true, message: `Package not found: ${engagementId}` },
        { status: 404 },
      );
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const pkg = JSON.parse(raw) as unknown;

    return NextResponse.json(pkg, {
      headers: {
        // Allow ICA Agentic App to read this from any origin
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: true, message },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import {
  readStakeholderDirectory,
  writeStakeholderDirectory,
} from '@/services/stakeholder-service';
import type { StakeholderDirectory } from '@/types/domain';

export const dynamic = 'force-dynamic';

// ─── GET /api/stakeholders ────────────────────────────────────────────────────
// Returns the current stakeholder directory (name + email per delivery role).

export async function GET() {
  const dir = readStakeholderDirectory();
  return NextResponse.json({ ok: true, stakeholders: dir });
}

// ─── POST /api/stakeholders ───────────────────────────────────────────────────
// Saves an updated stakeholder directory.
// Body: Partial<StakeholderDirectory> — only the roles you want to update.

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<StakeholderDirectory>;

    // Merge over the current directory so you only need to send changed roles
    const current = readStakeholderDirectory();
    const updated: StakeholderDirectory = {
      consultant: body.consultant ?? current.consultant,
      architect: body.architect ?? current.architect,
      partner: body.partner ?? current.partner,
      client: body.client ?? current.client,
      updatedAt: new Date().toISOString(),
    };

    writeStakeholderDirectory(updated);
    return NextResponse.json({ ok: true, stakeholders: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: true, message, pipelineStage: 'failed' }, { status: 500 });
  }
}

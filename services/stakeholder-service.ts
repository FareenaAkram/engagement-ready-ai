/**
 * Stakeholder Directory Service
 *
 * Stores the real names, emails, and Slack handles of the four delivery roles:
 *   consultant | architect | partner | client
 *
 * Persisted to .next/tmp/stakeholders.json — editable via:
 *   GET  /api/stakeholders          → read current directory
 *   POST /api/stakeholders          → save updated directory
 *
 * These are stamped onto every TaskAssignment when the HITL fires.
 * ICA uses them to know WHO to notify for each task.
 *
 * Defaults come from .env.local — set these so you don't have to configure
 * them in the UI every time:
 *   STAKEHOLDER_CONSULTANT_NAME=Fareena Akram
 *   STAKEHOLDER_CONSULTANT_EMAIL=Fareena.Akram@ibm.com
 *   STAKEHOLDER_ARCHITECT_NAME=James Wilson
 *   STAKEHOLDER_ARCHITECT_EMAIL=Fareena.Akram@ibm.com
 *   STAKEHOLDER_PARTNER_NAME=David Park
 *   STAKEHOLDER_PARTNER_EMAIL=Fareena.Akram@ibm.com
 *   STAKEHOLDER_CLIENT_NAME=Client Contact
 *   STAKEHOLDER_CLIENT_EMAIL=Fareena.Akram@ibm.com
 */

import fs from 'fs';
import path from 'path';
import { appEnv } from '@/lib/env';
import type { StakeholderDirectory } from '@/types/domain';

const STAKEHOLDER_FILE = path.join(process.cwd(), '.next', 'tmp', 'stakeholders.json');

// ─── Defaults from env (or hardcoded fallbacks) ───────────────────────────────

function buildDefaultDirectory(): StakeholderDirectory {
  return {
    consultant: {
      role: 'consultant',
      name: appEnv.stakeholderConsultantName,
      email: appEnv.stakeholderConsultantEmail,
    },
    architect: {
      role: 'architect',
      name: appEnv.stakeholderArchitectName,
      email: appEnv.stakeholderArchitectEmail,
    },
    partner: {
      role: 'partner',
      name: appEnv.stakeholderPartnerName,
      email: appEnv.stakeholderPartnerEmail,
    },
    client: {
      role: 'client',
      name: appEnv.stakeholderClientName,
      email: appEnv.stakeholderClientEmail,
    },
    updatedAt: new Date().toISOString(),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function readStakeholderDirectory(): StakeholderDirectory {
  try {
    if (fs.existsSync(STAKEHOLDER_FILE)) {
      const raw = fs.readFileSync(STAKEHOLDER_FILE, 'utf-8');
      return JSON.parse(raw) as StakeholderDirectory;
    }
  } catch {
    // fall through to defaults
  }
  return buildDefaultDirectory();
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function writeStakeholderDirectory(dir: StakeholderDirectory): void {
  try {
    const folder = path.dirname(STAKEHOLDER_FILE);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      STAKEHOLDER_FILE,
      JSON.stringify({ ...dir, updatedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch {
    // non-fatal
  }
}

// ─── Lookup a single role ─────────────────────────────────────────────────────

export function getStakeholderByRole(
  dir: StakeholderDirectory,
  role: 'consultant' | 'architect' | 'partner' | 'client',
) {
  return dir[role];
}

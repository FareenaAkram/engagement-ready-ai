'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  LoaderCircle,
  Paperclip,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/components/ui/toast';
import { useWorkflowStore } from '@/store/workflow-store';
import { readinessLabel, statusTone } from '@/lib/utils';
import type { AIAnalysisResult, EvidenceType, ReviewRequestInput, WorkflowEnvelope } from '@/types/domain';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmitReviewResult {
  data?: AIAnalysisResult;
  generatedAt?: string;
  workflow?: WorkflowEnvelope;
  error?: boolean;
  message?: string;
  pipelineStage?: string;
}

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  preview?: string;
  /** The real File object — kept so we can upload it for server-side extraction */
  file?: File;
}

async function submitAssessment(
  input: ReviewRequestInput,
  files: AttachedFile[],
): Promise<SubmitReviewResult> {
  const hasFiles = files.some((f) => f.file);

  if (hasFiles) {
    // Send as multipart/form-data so the server can extract PDF/DOCX text
    const form = new FormData();
    form.append('projectContext', input.projectContext);
    if (input.consultantComment) form.append('consultantComment', input.consultantComment);
    if (input.evidenceType)      form.append('evidenceType', input.evidenceType);
    if (input.engagementName)    form.append('engagementName', input.engagementName);
    if (input.clientName)        form.append('clientName', input.clientName);
    if (input.leadConsultant)    form.append('leadConsultant', input.leadConsultant);
    for (const f of files) {
      if (f.file) form.append('file', f.file, f.name);
    }
    const res = await fetch('/api/readiness-review', { method: 'POST', body: form });
    return res.json();
  }

  // No files — send as JSON (existing path, no change)
  const res = await fetch('/api/readiness-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.json();
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_NOTES = `Discovery Workshop Notes — Meridian Financial Group
Date: 15 July 2025 | Lead: Sarah Chen | Duration: 3 hours

BUSINESS OBJECTIVES
• Replace legacy core banking system (15 years old) with cloud-native platform
• Improve transaction processing speed by 60%
• Enable real-time digital channel integration for mobile and web
• Achieve 99.99% availability for core transaction processing

REQUIREMENTS DISCUSSED
• Real-time payment processing (ISO 20022 compliance required)
• Multi-factor authentication — MFA vendor TBD (client considering Okta vs Azure AD)
• Data migration: 8 years of transaction history (~2TB estimated)
• API-first architecture for third-party integrations
• Regulatory compliance: GDPR, local financial regulations

TECHNICAL DISCUSSIONS
• Legacy system runs on IBM AS/400 — schema documentation incomplete
• Integration with existing ERP (SAP) required
• Cloud provider not yet decided (AWS vs IBM Cloud)
• Security architecture not defined — no security stakeholder in attendance

STAKEHOLDERS PRESENT
• CTO: James Wilson (sponsor)
• VP of Digital: Maya Patel
• Senior BA: David Lee

OPEN ITEMS / CONCERNS
• Security and Compliance team not represented — meeting to be scheduled
• Authentication approach has not been finalised — needs architecture decision
• Data migration complexity unknown until legacy schema is reviewed
• Budget approval for cloud infrastructure pending CFO sign-off`;

const PIPELINE_STEPS = [
  {
    step: 1,
    label: 'Engagement Knowledge Agent',
    sublabel: 'Context Studio',
    description: 'Parsing evidence — extracting business objectives, stakeholders, and requirements',
  },
  {
    step: 2,
    label: 'Delivery Readiness Advisor',
    sublabel: 'watsonx.ai · IBM Granite',
    description: 'Scoring readiness 0–100% with an evidence-backed explainability trace',
  },
  {
    step: 3,
    label: 'Action Plan Generator',
    sublabel: 'watsonx.ai · IBM Granite',
    description: 'Building consulting follow-up actions and drafting initial assets',
  },
];

const EVIDENCE_TYPES: Array<{ value: EvidenceType; label: string; group: string }> = [
  { value: 'workshop-notes',         label: 'Workshop Notes',           group: 'Discovery' },
  { value: 'meeting-minutes',        label: 'Meeting Minutes',          group: 'Discovery' },
  { value: 'meeting-transcript',     label: 'Meeting Transcript',       group: 'Discovery' },
  { value: 'video-transcript',       label: 'Video Transcript',         group: 'Discovery' },
  { value: 'architecture-notes',     label: 'Architecture Notes',       group: 'Technical' },
  { value: 'solution-design',        label: 'Solution Design',          group: 'Technical' },
  { value: 'brd',                    label: 'BRD',                      group: 'Requirements' },
  { value: 'fsd',                    label: 'FSD',                      group: 'Requirements' },
  { value: 'business-requirements',  label: 'Business Requirements',    group: 'Requirements' },
  { value: 'functional-requirements',label: 'Functional Requirements',  group: 'Requirements' },
  { value: 'proposal',               label: 'Proposal / SOW',           group: 'Commercial' },
  { value: 'scope-document',         label: 'Scope Document',           group: 'Commercial' },
  { value: 'raid-log',               label: 'RAID Log',                 group: 'Risk' },
  { value: 'email',                  label: 'Email Thread',             group: 'Communication' },
  { value: 'process-flow',           label: 'Process Flow',             group: 'Process' },
  { value: 'decision-log',           label: 'Decision Log',             group: 'Governance' },
];

const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/quicktime', 'video/webm',
  'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(type: string) {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('audio/')) return '🎵';
  if (type.startsWith('video/')) return '🎬';
  if (type === 'application/pdf') return '📄';
  return '📎';
}

// ─── Multi-document evidence types ───────────────────────────────────────────

interface EvidenceDocument {
  id: string;
  evidenceType: EvidenceType;
  title: string;
  content: string;
}

function makeDoc(): EvidenceDocument {
  return { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, evidenceType: 'workshop-notes', title: '', content: '' };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReadinessReviewWorkspace() {
  const router = useRouter();
  const pushToast = useToastStore((s) => s.push);
  const setReviewResult = useWorkflowStore((s) => s.setReviewResult);

  // Real engagement identity — flows through to Slack, email, and ICA dispatch
  // instead of falling back to placeholder demo data.
  const [engagementName, setEngagementName] = useState('');
  const [clientName, setClientName] = useState('');
  const [leadConsultant, setLeadConsultant] = useState('');

  // Multi-document state — replaces the single textarea
  const [docs, setDocs] = useState<EvidenceDocument[]>([makeDoc()]);
  const [consultantComment, setConsultantComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Build the combined projectContext string from all docs
  function buildCombinedContext(): string {
    return docs
      .filter((d) => d.content.trim())
      .map((d) => {
        const typeLabel = EVIDENCE_TYPES.find((t) => t.value === d.evidenceType)?.label ?? d.evidenceType;
        const titlePart = d.title.trim() ? ` — ${d.title.trim()}` : '';
        return `[${typeLabel.toUpperCase()}${titlePart}]\n${d.content.trim()}`;
      })
      .join('\n\n');
  }

  function updateDoc(id: string, patch: Partial<EvidenceDocument>) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addDoc() {
    setDocs((prev) => [...prev, makeDoc()]);
  }

  function removeDoc(id: string) {
    setDocs((prev) => (prev.length > 1 ? prev.filter((d) => d.id !== id) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const combined = buildCombinedContext();
    if (!combined.trim()) return;

    setIsSubmitting(true);
    setCurrentStep(1);
    setResult(null);

    const stepTimer = (step: number, delay: number) =>
      new Promise<void>((resolve) => setTimeout(() => { setCurrentStep(step); resolve(); }, delay));

    const simulationPromise = Promise.all([stepTimer(2, 1800), stepTimer(3, 3600)]);

    try {
      const [response] = await Promise.all([
        submitAssessment(
          {
            projectContext: buildCombinedContext(),
            consultantComment: consultantComment.trim() || undefined,
            // Primary evidence type is from the first document
            evidenceType: docs[0]?.evidenceType ?? 'workshop-notes',
            engagementName: engagementName.trim() || undefined,
            clientName: clientName.trim() || undefined,
            leadConsultant: leadConsultant.trim() || undefined,
          },
          attachedFiles,
        ),
        simulationPromise,
      ]);

      setCurrentStep(4);

      if (response.error || !response.data || !response.workflow) {
        pushToast({
          title: 'Assessment failed',
          description: response.message ?? 'The AI pipeline could not complete. Check your watsonx credentials in .env.local and try again.',
          tone: 'error',
        });
        setIsSubmitting(false);
        setCurrentStep(0);
        return;
      }

      setReviewResult(response.data, response.workflow);
      setResult(response.data);
      pushToast({
        title: 'Assessment complete',
        description: `Score: ${response.data.readinessScore}% — ${readinessLabel(response.data.readinessDecision)}`,
        tone: 'success',
      });
    } catch {
      pushToast({
        title: 'Connection error',
        description: 'Could not reach the server. Check your network and try again.',
        tone: 'error',
      });
      setIsSubmitting(false);
      setCurrentStep(0);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    e.target.value = '';
  }

  function addFiles(files: File[]) {
    const valid = files.filter((f) => ACCEPTED_FILE_TYPES.includes(f.type) || f.name.endsWith('.txt'));
    if (valid.length < files.length) {
      pushToast({
        title: 'Some files skipped',
        description: 'Only PDF, images, audio, video, and text files are accepted.',
        tone: 'warning',
      });
    }
    const mapped: AttachedFile[] = valid.map((f) => ({
      name: f.name,
      type: f.type,
      size: f.size,
      file: f,
    }));
    setAttachedFiles((prev) => [...prev, ...mapped]);
    if (mapped.length > 0) {
      const extractable = mapped.filter((f) =>
        f.type === 'application/pdf' ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.docx')
      );
      pushToast({
        title: `${mapped.length} file${mapped.length > 1 ? 's' : ''} attached`,
        description: extractable.length > 0
          ? `${extractable.length} file${extractable.length > 1 ? 's' : ''} (PDF/DOCX/text) will be read by the AI automatically.`
          : 'Attached for reference. Paste extracted text below for AI analysis.',
        tone: 'info',
      });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="page-stack">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[
          { n: 1, label: 'Choose type' },
          { n: 2, label: 'Add evidence' },
          { n: 3, label: 'Run assessment' },
        ].map(({ n, label }, i, arr) => (
          <div key={n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent-strong">
                {n}
              </span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-border-strong" />}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Left: form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Engagement identity — flows through to Slack/email/ICA dispatch instead of placeholder data */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <StepHeader n="•" title="Engagement details" />
            <p className="mt-1 text-xs text-muted-foreground">
              Used in every notification and delivery asset this engagement generates. Leave blank to use demo placeholders.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-foreground">Engagement / project name</span>
                <input
                  className="mt-1.5 h-9 w-full rounded-lg border border-border/60 bg-black/15 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
                  placeholder="e.g. Core Banking Modernization"
                  value={engagementName}
                  onChange={(e) => setEngagementName(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-foreground">Client name</span>
                <input
                  className="mt-1.5 h-9 w-full rounded-lg border border-border/60 bg-black/15 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
                  placeholder="e.g. Acme Corp"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-foreground">Lead consultant</span>
                <input
                  className="mt-1.5 h-9 w-full rounded-lg border border-border/60 bg-black/15 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
                  placeholder="e.g. Jordan Lee"
                  value={leadConsultant}
                  onChange={(e) => setLeadConsultant(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </div>

          {/* Steps 1+2 — Multi-document evidence input */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <div className="flex items-start justify-between gap-3">
              <StepHeader n="1–2" title="Add your engagement evidence" />
              <button
                type="button"
                onClick={() => {
                  setDocs([{ id: `doc-sample-${Date.now()}`, evidenceType: 'workshop-notes', title: 'Discovery Workshop — Meridian Financial Group', content: SAMPLE_NOTES }]);
                }}
                disabled={isSubmitting}
                className="shrink-0 text-xs text-accent-strong underline-offset-2 hover:underline disabled:opacity-50"
              >
                Load sample
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one card per document — workshop notes, BRDs, emails, architecture notes. Each gets labelled separately so the AI understands the source.
            </p>

            <div className="mt-4 space-y-3">
              {docs.map((doc, idx) => (
                <div key={doc.id} className="rounded-xl border border-border/60 bg-black/10 p-4">
                  {/* Doc header row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent-strong min-w-[20px]">
                      #{idx + 1}
                    </span>
                    {/* Evidence type */}
                    <div className="relative flex-1">
                      <select
                        value={doc.evidenceType}
                        onChange={(e) => updateDoc(doc.id, { evidenceType: e.target.value as EvidenceType })}
                        disabled={isSubmitting}
                        className="h-8 w-full appearance-none rounded-lg border border-border/60 bg-black/15 pl-3 pr-8 text-xs text-foreground outline-none transition focus:border-accent disabled:opacity-50"
                      >
                        {Array.from(new Set(EVIDENCE_TYPES.map((t) => t.group))).map((group) => (
                          <optgroup key={group} label={group}>
                            {EVIDENCE_TYPES.filter((t) => t.group === group).map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    {/* Optional title */}
                    <input
                      className="h-8 flex-1 rounded-lg border border-border/60 bg-black/15 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
                      placeholder="Title (optional)"
                      value={doc.title}
                      onChange={(e) => updateDoc(doc.id, { title: e.target.value })}
                      disabled={isSubmitting}
                    />
                    {/* Remove button */}
                    {docs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDoc(doc.id)}
                        disabled={isSubmitting}
                        className="shrink-0 text-muted-foreground/50 hover:text-danger disabled:opacity-30"
                        aria-label="Remove document"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* Content textarea */}
                  <textarea
                    className="h-36 w-full resize-none rounded-lg border border-border/60 bg-black/10 p-3 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
                    placeholder={`Paste ${EVIDENCE_TYPES.find((t) => t.value === doc.evidenceType)?.label ?? 'document'} content here…`}
                    value={doc.content}
                    onChange={(e) => updateDoc(doc.id, { content: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {doc.content.trim() && (
                    <p className="mt-1 text-right text-[11px] text-muted-foreground/50">
                      {doc.content.trim().split(/\s+/).length} words
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Add document button */}
            {docs.length < 10 && (
              <button
                type="button"
                onClick={addDoc}
                disabled={isSubmitting}
                className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-border/50 px-4 py-2.5 text-xs text-muted-foreground transition hover:border-accent/60 hover:text-accent-strong disabled:opacity-40 w-full justify-center"
              >
                <span className="text-base leading-none">+</span>
                Add another document ({docs.length}/10)
              </button>
            )}

            {/* Total word count */}
            {buildCombinedContext().trim() && (
              <p className="mt-2 text-right text-xs text-muted-foreground/50">
                {buildCombinedContext().trim().split(/\s+/).length} words across {docs.filter((d) => d.content.trim()).length} document(s)
              </p>
            )}

            {/* Attachment drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition ${
                isDragging
                  ? 'border-accent bg-accent/5'
                  : 'border-border/40 bg-white/[0.015] hover:border-border/70'
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                <span>
                  Drop PDF, image, audio, or video — or{' '}
                  <label className="cursor-pointer text-accent-strong underline-offset-2 hover:underline">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.mov,.webm,.txt,.docx"
                      onChange={handleFileChange}
                      disabled={isSubmitting}
                    />
                  </label>
                </span>
              </div>
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>

            {/* Attached files */}
            {attachedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-white/[0.02] px-3 py-2">
                    <span className="text-base leading-none">{fileTypeIcon(f.type)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{f.name}</span>
                    {(f.type === 'application/pdf' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.docx')) ? (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold text-accent-strong">AI reads</span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">ref only</span>
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatFileSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground/50 hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground/60 px-1">
                  Files attached for reference. For AI analysis, paste the extracted text above.
                </p>
              </div>
            )}

            {/* Consultant comment */}
            <div className="mt-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">
                  Consultant comment <span className="text-muted-foreground/60">(optional)</span>
                </span>
                <input
                  className="mt-1.5 h-10 w-full rounded-xl border border-border/60 bg-black/15 px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-accent disabled:opacity-50"
                  placeholder="Add context or focus areas for the AI…"
                  value={consultantComment}
                  onChange={(e) => setConsultantComment(e.target.value)}
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </div>

          {/* Step 3 — Submit */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <StepHeader n="3" title="Run the AI assessment" />
            <p className="mt-1 text-sm text-muted-foreground">
              IBM Granite will evaluate delivery readiness across 10 dimensions and produce a scored, explainable recommendation.
            </p>
            <div className="mt-4">
              <Button
                type="submit"
                disabled={isSubmitting || !buildCombinedContext().trim()}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Running analysis…</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" />Run AI assessment</>
                )}
              </Button>
              {!buildCombinedContext().trim() && (
                <p className="mt-2 text-xs text-muted-foreground/60">Paste some text above to continue.</p>
              )}
            </div>
          </div>

          {/* Pipeline progress */}
          {isSubmitting && (
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent-strong">
                Analysis running
              </p>
              <div className="space-y-3">
                {PIPELINE_STEPS.map(({ step, label, sublabel, description }) => {
                  const isDone = currentStep > step;
                  const isActive = currentStep === step;
                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                        isDone
                          ? 'border-green-500/25 bg-green-500/5'
                          : isActive
                            ? 'border-accent/30 bg-accent/5'
                            : 'border-border/40 bg-white/[0.015] opacity-50'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                          isDone
                            ? 'border-green-500/40 text-green-400'
                            : isActive
                              ? 'border-accent/50 text-accent-strong'
                              : 'border-border/50 text-muted-foreground/50'
                        }`}
                      >
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : isActive ? <LoaderCircle className="h-4 w-4 animate-spin" /> : step}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className={`text-sm font-medium ${isDone ? 'text-green-400' : isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {label}
                          </p>
                          <span className="text-[10px] text-muted-foreground">{sublabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Result */}
          {result && !isSubmitting && (
            <AssessmentResult result={result} onViewFindings={() => router.push('/ai-analysis')} />
          )}
        </form>

        {/* Right: explainer */}
        <div className="space-y-4">
          {/* How it works */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
            <div className="space-y-3">
              {[
                {
                  tag: 'Context Studio',
                  name: 'Engagement Knowledge',
                  desc: 'Retrieves governance rules and ontology once — structures evidence into business objectives, requirements, and stakeholders.',
                },
                {
                  tag: 'watsonx.ai',
                  name: 'Readiness Advisor',
                  desc: 'IBM Granite scores readiness 0–100%, explains WHY, and identifies missing stakeholders, workshops, and requirements.',
                },
                {
                  tag: 'ICA',
                  name: 'Consulting Productivity',
                  desc: 'After assessment, IBM Consulting Advantage generates 18 consulting artefacts on demand — summaries, RAID logs, user stories, emails.',
                },
              ].map(({ tag, name, desc }) => (
                <div key={tag} className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-accent-strong">{tag}</span>
                  </div>
                  <p className="text-xs font-semibold text-foreground">{name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* What you get */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              What you get
            </p>
            <ul className="space-y-1.5">
              {[
                'Readiness score 0–100%',
                'Ready / Conditions / Not Ready verdict',
                'Explainable reasoning trace',
                'Critical delivery blockers',
                'Missing stakeholders',
                'Missing workshops',
                'Missing requirement categories',
                'Open questions for the client',
                'Follow-up action plan',
                '18 ICA artefacts on demand',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ChevronRight className="h-3 w-3 shrink-0 text-accent-strong" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Supported formats */}
          <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Supported attachments
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { emoji: '📄', label: 'PDF' },
                { emoji: '🖼️', label: 'Images' },
                { emoji: '🎵', label: 'MP3 / Audio' },
                { emoji: '🎬', label: 'MP4 / Video' },
                { emoji: '📝', label: 'Text / CSV' },
                { emoji: '📋', label: 'Word / DOCX' },
              ].map(({ emoji, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{emoji}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground/60 leading-4">
              PDF, DOCX, and text files are read by the AI automatically. Images and audio/video are attached for reference only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step header helper ───────────────────────────────────────────────────────

function StepHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent-strong">
        {n}
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

// ─── Assessment result ────────────────────────────────────────────────────────

function AssessmentResult({ result, onViewFindings }: { result: AIAnalysisResult; onViewFindings: () => void }) {
  const decisionColor =
    result.readinessDecision === 'ready'
      ? 'border-green-500/25 bg-green-500/[0.04]'
      : result.readinessDecision === 'ready-with-conditions'
        ? 'border-yellow-500/25 bg-yellow-500/[0.04]'
        : 'border-red-500/25 bg-red-500/[0.04]';

  return (
    <div className={`rounded-2xl border p-5 ${decisionColor}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent-strong" />
          <p className="text-sm font-semibold text-foreground">Assessment complete</p>
        </div>
        <span className={`text-base font-bold ${statusTone(result.readinessDecision)}`}>
          {result.readinessScore}%
        </span>
      </div>

      {/* Verdict */}
      <p className={`mt-2 text-sm font-semibold ${statusTone(result.readinessDecision)}`}>
        {readinessLabel(result.readinessDecision)} · {result.confidenceScore}% confidence
      </p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{result.executiveSummary}</p>

      {/* Critical issues preview */}
      {result.criticalIssues.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {result.criticalIssues.slice(0, 2).map((issue) => (
            <div key={issue} className="flex items-start gap-2 rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <p className="text-xs text-foreground">{issue}</p>
            </div>
          ))}
          {result.criticalIssues.length > 2 && (
            <p className="text-xs text-muted-foreground pl-2">+{result.criticalIssues.length - 2} more in AI Findings</p>
          )}
        </div>
      )}

      {/* Reasoning trace preview */}
      {result.reasoningTrace && result.reasoningTrace.length > 0 && (
        <div className="mt-3 space-y-1">
          {result.reasoningTrace.slice(0, 3).map((item) => (
            <div key={item.category} className="flex items-start gap-2 text-xs">
              <span className={`shrink-0 font-bold ${item.status === 'present' ? 'text-green-400' : item.status === 'blocking' ? 'text-danger' : 'text-yellow-400'}`}>
                {item.status === 'present' ? '✓' : item.status === 'blocking' ? '✗' : '⚠'}
              </span>
              <span className="font-medium text-foreground">{item.category}</span>
              <span className="text-muted-foreground truncate">{item.evidence}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <QuickStat label="Actions" value={String(result.actionPlan.actions.length)} />
        <QuickStat label="Assets" value={String(result.consultingAssets.length)} />
        <QuickStat label="Time saved" value={`${result.estimatedTimeSavedHours}h`} />
      </div>

      {/* CTAs */}
      <div className="mt-4 flex gap-2">
        <Button onClick={onViewFindings} className="flex-1" size="sm">
          <Bot className="mr-1.5 h-3.5 w-3.5" />
          View AI findings
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <a href="/maintenance-tasks">
            Actions <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-black/10 p-2.5 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// Unused but kept for import compatibility
function _FileText() { return <FileText className="h-4 w-4" />; }
void _FileText;

/**
 * File Extraction Service
 *
 * Extracts plain text from uploaded files so the content can be sent to Granite.
 * Supports: PDF, DOCX, plain text. Images and audio/video are noted but not transcribed
 * (would require a separate vision/transcription API).
 *
 * Called from POST /api/readiness-review when the request is multipart/form-data.
 * Falls back gracefully — if extraction fails the file is simply skipped.
 */

/**
 * Extract text from a Buffer by MIME type.
 * Returns an object with the extracted text and a label for the Granite prompt.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<{ text: string; label: string }> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  // ── Plain text ──────────────────────────────────────────────────────────────
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/markdown' ||
    ext === 'txt' ||
    ext === 'md' ||
    ext === 'csv'
  ) {
    return { text: buffer.toString('utf-8').trim(), label: `TEXT FILE — ${fileName}` };
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    try {
      // Dynamic import — avoids test-environment issues with pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import('pdf-parse')) as any).default ?? (await import('pdf-parse'));
      const result = await pdfParse(buffer);
      const text = result.text?.trim() ?? '';
      if (text.length < 20) {
        return { text: '', label: '' }; // scanned-image PDF — no extractable text
      }
      return { text, label: `PDF DOCUMENT — ${fileName}` };
    } catch (err) {
      console.warn(`[file-extraction] PDF parse failed for ${fileName}:`, err instanceof Error ? err.message : err);
      return { text: '', label: '' };
    }
  }

  // ── DOCX ────────────────────────────────────────────────────────────────────
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.trim(), label: `WORD DOCUMENT — ${fileName}` };
    } catch (err) {
      console.warn(`[file-extraction] DOCX parse failed for ${fileName}:`, err instanceof Error ? err.message : err);
      return { text: '', label: '' };
    }
  }

  // ── Images, audio, video — not extractable without vision/transcription API ─
  if (mimeType.startsWith('image/') || mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    console.log(`[file-extraction] ${mimeType} file "${fileName}" — text extraction not supported, skipping.`);
    return { text: '', label: '' };
  }

  // Unknown type — skip
  return { text: '', label: '' };
}

/**
 * Append extracted file texts to an existing project context string.
 * Each extracted document is wrapped in labelled section markers so Granite
 * knows the provenance of each block of text.
 */
export function appendExtractedFiles(
  existingContext: string,
  extractions: Array<{ text: string; label: string; evidenceType?: string }>,
): string {
  const nonEmpty = extractions.filter((e) => e.text.trim().length > 0);
  if (nonEmpty.length === 0) return existingContext;

  const sections = nonEmpty.map(({ text, label, evidenceType }) => {
    const header = evidenceType
      ? `[${evidenceType.toUpperCase()} — ${label}]`
      : `[UPLOADED FILE — ${label}]`;
    // Truncate to 4000 chars per file to avoid blowing the token budget
    const truncated = text.length > 4000
      ? text.slice(0, 4000) + '\n...[truncated]'
      : text;
    return `${header}\n${truncated}`;
  });

  const separator = existingContext.trim() ? '\n\n' : '';
  return existingContext + separator + sections.join('\n\n');
}

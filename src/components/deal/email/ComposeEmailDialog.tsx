import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Check,
  AlertCircle,
  Upload,
  FileText,
  Save,
  History,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { RecipientField, emailStringToArray } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import { supabase } from '@/integrations/supabase/client';

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void | Promise<void>;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
}

const COMPOSE_DRAFT_PREFIX = 'compose_draft_';
const COMPOSE_AUTOSAVE_DEBOUNCE_MS = 800;

/** How many autosaved versions of a draft to keep in history. */
const DRAFT_HISTORY_MAX_ENTRIES = 8;
/**
 * Minimum gap between successive history entries. Prevents flooding history
 * with near-identical snapshots when the user is typing quickly.
 */
const DRAFT_HISTORY_MIN_GAP_MS = 8000;

/** How long the user has to undo a send before it's actually delivered. */
const UNDO_SEND_WINDOW_MS = 5000;

// Upload limits
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB per file
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB combined
const MAX_ATTACHMENT_COUNT = 10;

// Allowed file types (extension allowlist + matching MIME hints).
// We validate by extension because MIME type can be empty / inconsistent across OSes.
const ALLOWED_EXTENSIONS = [
  // Documents
  'pdf', 'doc', 'docx', 'txt', 'rtf', 'md',
  // Spreadsheets
  'xls', 'xlsx', 'csv',
  // Presentations
  'ppt', 'pptx',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic',
  // Archives
  'zip',
  // Email / other
  'eml', 'msg',
] as const;

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'msi', 'dll', 'app', 'scr', 'js', 'jar', 'vbs', 'ps1',
]);

type AttachmentStatus = 'uploading' | 'ready' | 'error';

interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  /** File handle (omitted when restored from draft) */
  file?: File;
  status: AttachmentStatus;
  /** 0–100 */
  progress: number;
  error?: string;
  /** Storage object path returned by the upload-email-attachment edge function. */
  storagePath?: string;
  /** Bucket the object lives in (currently always 'email-attachments'). */
  storageBucket?: string;
  /**
   * Object URL for a lightweight thumbnail preview. Set for image files
   * (direct object URL of the file) and PDFs (rendered first page).
   * Must be revoked when the attachment is removed or the dialog closes.
   */
  previewUrl?: string;
  /** Kind of preview we generated, for fallback rendering decisions. */
  previewKind?: 'image' | 'pdf';
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const IMAGE_PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const PDF_PREVIEW_MAX_BYTES = 10 * 1024 * 1024; // skip very large PDFs to keep things snappy

/**
 * Render the first page of a PDF to a small JPEG and return an object URL.
 * Uses pdfjs-dist with a CDN-hosted worker so we don't need to bundle one.
 * Returns null on any failure (encrypted PDFs, network issues, etc.).
 */
async function generatePdfThumbnail(file: File): Promise<string | null> {
  try {
    const pdfjs = await import('pdfjs-dist');
    // Point worker at the matching version on a CDN to avoid bundling it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(pdfjs as any).version}/build/pdf.worker.min.mjs`;

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf, disableAutoFetch: true, disableStream: true }).promise;
    const page = await doc.getPage(1);

    const targetWidth = 96; // matches the thumbnail box in the UI
    const viewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewport.width;
    const scaled = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      doc.destroy();
      return null;
    }
    await page.render({ canvasContext: ctx, viewport: scaled }).promise;

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', 0.7),
    );
    doc.destroy();
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(
  file: File,
  existing: AttachmentItem[],
): { ok: true } | { ok: false; reason: string } {
  const ext = getExtension(file.name);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `File type ".${ext}" is not allowed for security reasons` };
  }
  if (ext && !ALLOWED_EXTENSIONS.includes(ext as typeof ALLOWED_EXTENSIONS[number])) {
    return { ok: false, reason: `File type ".${ext}" is not supported` };
  }
  if (file.size === 0) {
    return { ok: false, reason: 'File is empty' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `File exceeds ${formatBytes(MAX_FILE_SIZE_BYTES)} limit (is ${formatBytes(file.size)})`,
    };
  }

  const totalAfter = existing.reduce((sum, a) => sum + a.size, 0) + file.size;
  if (totalAfter > MAX_TOTAL_SIZE_BYTES) {
    return {
      ok: false,
      reason: `Total attachment size would exceed ${formatBytes(MAX_TOTAL_SIZE_BYTES)}`,
    };
  }

  // Duplicate by name + size
  if (existing.some(a => a.name === file.name && a.size === file.size)) {
    return { ok: false, reason: 'This file is already attached' };
  }

  return { ok: true };
}

interface ComposeDraft {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  /** Persisted as lightweight metadata; File blobs are not serializable. */
  attachments: Array<{ id: string; name: string; size: number; type: string }>;
  showCcBcc: boolean;
  savedAt: number;
}

function getDraftKey(replyThreadId?: string): string {
  return `${COMPOSE_DRAFT_PREFIX}${replyThreadId ?? 'new'}`;
}

function loadDraft(key: string): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ComposeDraft;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: ComposeDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*  Draft version history                                                     */
/* -------------------------------------------------------------------------- */

interface DraftHistoryEntry {
  /** Stable id so React lists / restore actions can target a specific entry. */
  id: string;
  draft: ComposeDraft;
}

function getHistoryKey(replyThreadId?: string): string {
  return `${COMPOSE_DRAFT_PREFIX}history_${replyThreadId ?? 'new'}`;
}

function loadHistory(key: string): DraftHistoryEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DraftHistoryEntry[];
  } catch {
    return [];
  }
}

function persistHistory(key: string, entries: DraftHistoryEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    /* storage full — silently degrade */
  }
}

function clearHistory(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Compare just the user-visible content (ignore savedAt) to dedupe versions. */
function draftContentSignature(d: ComposeDraft): string {
  return JSON.stringify({
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: d.body,
    attachments: d.attachments.map(a => `${a.name}:${a.size}`),
    showCcBcc: d.showCcBcc,
  });
}

/**
 * Push a new snapshot onto the history stack (newest first), enforcing:
 *  - dedupe vs the most recent entry (no duplicate content)
 *  - rate limit (DRAFT_HISTORY_MIN_GAP_MS) so rapid edits collapse into one entry
 *  - cap at DRAFT_HISTORY_MAX_ENTRIES
 */
function pushHistoryEntry(key: string, draft: ComposeDraft): DraftHistoryEntry[] {
  const existing = loadHistory(key);
  const newest = existing[0];
  const sig = draftContentSignature(draft);

  if (newest) {
    const newestSig = draftContentSignature(newest.draft);
    if (newestSig === sig) {
      // Same content — just bump the timestamp on the newest entry
      const updated: DraftHistoryEntry[] = [
        { ...newest, draft: { ...newest.draft, savedAt: draft.savedAt } },
        ...existing.slice(1),
      ];
      persistHistory(key, updated);
      return updated;
    }
    if (draft.savedAt - newest.draft.savedAt < DRAFT_HISTORY_MIN_GAP_MS) {
      // Replace newest with this fresher snapshot to avoid spamming history
      const replaced: DraftHistoryEntry[] = [
        { id: newest.id, draft },
        ...existing.slice(1),
      ];
      persistHistory(key, replaced);
      return replaced;
    }
  }

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const next = [{ id, draft }, ...existing].slice(0, DRAFT_HISTORY_MAX_ENTRIES);
  persistHistory(key, next);
  return next;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 5_000) return 'just now';
  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

function isDraftMeaningful(d: Pick<ComposeDraft, 'subject' | 'body' | 'attachments' | 'to' | 'cc' | 'bcc'>): boolean {
  return !!(
    d.subject.trim() ||
    d.body.trim() ||
    d.attachments.length > 0 ||
    d.cc.length > 0 ||
    d.bcc.length > 0 ||
    // For new (non-reply) drafts, recipients also count
    d.to.length > 0
  );
}

export function ComposeEmailDialog({ open, onOpenChange, onSend, replyTo }: ComposeEmailDialogProps) {
  const [toRecipients, setToRecipients] = useState<string[]>(replyTo?.to_email ? [replyTo.to_email] : []);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Tracks in-flight XHR uploads keyed by attachment id, so we can abort them
   * when the user removes the attachment, discards the draft, or the dialog
   * unmounts mid-upload.
   */
  const uploadXhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  /**
   * Mirrors the latest `attachments` state so the unmount-only cleanup effect
   * (deps: []) can revoke any outstanding preview object URLs without needing
   * to re-subscribe on every state change.
   */
  const attachmentsRef = useRef<AttachmentItem[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
  const { search } = useEmailContacts();

  // Undo-send window state
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoToastIdRef = useRef<string | number | null>(null);
  const cancelledRef = useRef(false);
  /**
   * True from the moment the user clicks Send (undo window opens) until the
   * send completes, fails, or is undone. While true, autosave is suppressed
   * so the persisted draft continues to match exactly what was sent.
   * Tracked in a ref (not state) so the autosave effect doesn't re-fire on
   * value changes — autosave checks the ref directly.
   */
  const sendInProgressRef = useRef(false);

  const draftKey = useMemo(() => getDraftKey(replyTo?.threadId), [replyTo?.threadId]);
  const historyKey = useMemo(() => getHistoryKey(replyTo?.threadId), [replyTo?.threadId]);
  const hasRestoredRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(false);

  // Draft version history (newest first). Loaded lazily when the dialog opens.
  const [history, setHistory] = useState<DraftHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Restore any saved draft when the dialog opens
  useEffect(() => {
    if (!open) {
      hasRestoredRef.current = false;
      return;
    }
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    // Load existing version history for this thread
    setHistory(loadHistory(historyKey));

    const saved = loadDraft(draftKey);
    if (saved && isDraftMeaningful(saved)) {
      skipNextAutosaveRef.current = true;
      setToRecipients(saved.to ?? (replyTo?.to_email ? [replyTo.to_email] : []));
      setCcRecipients(saved.cc ?? []);
      setBccRecipients(saved.bcc ?? []);
      setSubject(saved.subject ?? (replyTo ? `Re: ${replyTo.subject}` : ''));
      setBody(saved.body ?? '');
      // Restored attachments only retain metadata — File blob is gone after reload.
      // Mark as ready so they appear in the list but they won't actually be re-uploaded.
      setAttachments(
        (saved.attachments ?? []).map(a => ({
          id: a.id,
          name: a.name,
          size: a.size,
          type: a.type,
          status: 'ready' as const,
          progress: 100,
        })),
      );
      setShowCcBcc(saved.showCcBcc ?? (saved.cc?.length > 0 || saved.bcc?.length > 0));
      setAutosaveStatus('saved');
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
    }
  }, [open, draftKey, historyKey, replyTo]);

  // Debounced autosave whenever form content changes (only while open)
  useEffect(() => {
    if (!open) return;
    // Suppress autosave while a send is in flight (undo window + delivery).
    // The persisted draft must remain a snapshot of exactly what was sent —
    // any subsequent edits should not overwrite that until delivery resolves.
    if (sendInProgressRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    const draft: ComposeDraft = {
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      // Persist only metadata for ready attachments. Skip in-flight / errored ones.
      attachments: attachments
        .filter(a => a.status === 'ready')
        .map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
      showCcBcc,
      savedAt: Date.now(),
    };

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    if (!isDraftMeaningful(draft)) {
      // Nothing worth saving — remove any stale draft
      clearDraft(draftKey);
      setAutosaveStatus('idle');
      return;
    }

    setAutosaveStatus('saving');
    autosaveTimerRef.current = setTimeout(() => {
      const ok = saveDraft(draftKey, draft);
      if (ok) {
        setAutosaveStatus('saved');
        // Record this snapshot in version history (deduped + rate-limited internally)
        setHistory(pushHistoryEntry(historyKey, draft));
        if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2000);
      } else {
        setAutosaveStatus('idle');
      }
    }, COMPOSE_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [open, draftKey, historyKey, toRecipients, ccRecipients, bccRecipients, subject, body, attachments, showCcBcc]);

  // Flush save on tab close / refresh
  useEffect(() => {
    if (!open) return;
    const handler = () => {
      // Don't overwrite the in-flight send snapshot during the undo window
      if (sendInProgressRef.current) return;
      const draft: ComposeDraft = {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        body,
        attachments: attachments
          .filter(a => a.status === 'ready')
          .map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
        showCcBcc,
        savedAt: Date.now(),
      };
      if (isDraftMeaningful(draft)) saveDraft(draftKey, draft);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [open, draftKey, toRecipients, ccRecipients, bccRecipients, subject, body, attachments, showCcBcc]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      // NOTE: Do NOT clear the undo-send timer here — the dialog unmounts
      // immediately after the user clicks Send (we close it for instant UX),
      // and the pending send must continue running in the background until
      // either the undo window elapses or the user clicks Undo on the toast.
      // Cancel any in-flight uploads so XHRs don't leak past unmount
      uploadXhrsRef.current.forEach(xhr => {
        try { xhr.abort(); } catch { /* ignore */ }
      });
      uploadXhrsRef.current.clear();
      // Revoke any preview object URLs we created so they don't leak.
      attachmentsRef.current.forEach(a => {
        if (a.previewUrl) {
          try { URL.revokeObjectURL(a.previewUrl); } catch { /* ignore */ }
        }
      });
    };
  }, []);

  // Keep attachmentsRef in sync for the unmount cleanup
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const resetForm = () => {
    setToRecipients(replyTo?.to_email ? [replyTo.to_email] : []);
    setCcRecipients([]);
    setBccRecipients([]);
    setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
    setBody('');
    setShowCcBcc(false);
    setAttachments([]);
    setAutosaveStatus('idle');
    skipNextAutosaveRef.current = true;
  };

  /**
   * Build the email payload from current form state. Snapshotted so an
   * undo-pending send isn't affected by later edits or unmount.
   */
  const buildEmailPayload = (): Omit<MockEmail, 'id' | 'threadId'> => {
    const toEmail = toRecipients[0] ?? '';
    const recipientName = toEmail
      ? toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : '';
    return {
      subject,
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: recipientName,
      to_email: toRecipients.join(', '),
      snippet: body.substring(0, 120),
      body_preview: body,
      received_at: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      folder: 'sent',
      labels: ['Sent'],
      has_attachments: attachments.length > 0,
      is_linked_to_deal: false,
      is_follow_up: false,
      needs_response: false,
      category: 'deal',
    };
  };

  /** Parse various error shapes into a user-friendly title + description. */
  const formatSendError = (err: unknown): { title: string; description: string; code?: string } => {
    if (!err) return { title: 'Failed to send', description: 'An unknown error occurred. Please try again.' };
    if (typeof err === 'string') return { title: 'Failed to send', description: err };
    if (err instanceof Error) {
      const msg = err.message || '';
      const lower = msg.toLowerCase();
      if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline')) {
        return {
          title: 'Network error',
          description: 'Could not reach the mail server. Check your connection and try again.',
          code: 'NETWORK',
        };
      }
      if (lower.includes('timeout')) {
        return { title: 'Request timed out', description: 'The mail server took too long to respond. Try again in a moment.', code: 'TIMEOUT' };
      }
      if (lower.includes('rate') || lower.includes('429')) {
        return { title: 'Sending too quickly', description: 'You\'ve hit the send rate limit. Wait a moment and retry.', code: 'RATE_LIMIT' };
      }
      if (lower.includes('auth') || lower.includes('401') || lower.includes('403')) {
        return { title: 'Authentication failed', description: 'Your mail account session has expired. Please reconnect.', code: 'AUTH' };
      }
      if (lower.includes('attachment') || lower.includes('size') || lower.includes('413')) {
        return { title: 'Attachment rejected', description: msg || 'One of your attachments was rejected by the mail server.', code: 'ATTACHMENT' };
      }
      if (lower.includes('recipient') || lower.includes('address')) {
        return { title: 'Invalid recipient', description: msg, code: 'RECIPIENT' };
      }
      return { title: 'Failed to send', description: msg };
    }
    if (typeof err === 'object') {
      const anyErr = err as { message?: string; error?: string; code?: string };
      return {
        title: 'Failed to send',
        description: anyErr.message || anyErr.error || 'Something went wrong while sending the email.',
        code: anyErr.code,
      };
    }
    return { title: 'Failed to send', description: 'An unexpected error occurred.' };
  };

  /** Actually deliver the email (called after the undo window elapses). */
  const performDelivery = async (
    payload: Omit<MockEmail, 'id' | 'threadId'>,
    snapshotDraftKey: string,
  ) => {
    setIsSending(true);
    try {
      await onSend(payload);
      clearDraft(snapshotDraftKey);
      // Send committed — autosave can resume safely (form is reset / closed).
      sendInProgressRef.current = false;
      toast.success('Email sent', {
        description: payload.to_email
          ? `Delivered to ${payload.to_email.split(',')[0]}${
              payload.to_email.includes(',') ? ` and ${payload.to_email.split(',').length - 1} other${payload.to_email.split(',').length > 2 ? 's' : ''}` : ''
            }`
          : undefined,
      });
    } catch (err) {
      const { title, description, code } = formatSendError(err);
      // Persist draft so the user doesn't lose content when delivery fails
      saveDraft(snapshotDraftKey, {
        to: payload.to_email.split(',').map(s => s.trim()).filter(Boolean),
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: payload.subject,
        body: payload.body_preview,
        attachments: attachments.filter(a => a.status === 'ready').map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
        showCcBcc,
        savedAt: Date.now(),
      });
      toast.error(title, {
        description: code ? `${description} (${code})` : description,
        duration: 10000,
        action: {
          label: 'Retry',
          onClick: () => {
            // Reopen the dialog and retry — content is already restored from draft
            onOpenChange(true);
            setTimeout(() => void performDelivery(payload, snapshotDraftKey), 50);
          },
        },
      });
      // Send failed — release the autosave guard so further edits can persist.
      sendInProgressRef.current = false;
    } finally {
      setIsSending(false);
    }
  };

  const executeSend = () => {
    clearPreSendAlert();
    if (toRecipients.length === 0) {
      toast.error('Please add a recipient');
      return;
    }

    // Snapshot everything we need so later edits / closes don't change behavior
    const payload = buildEmailPayload();
    const snapshotDraftKey = draftKey;
    const recipientLabel = payload.to_email.split(',')[0].trim();

    cancelledRef.current = false;
    // Lock autosave: from this moment until the send commits / fails / is undone,
    // the persisted draft is the snapshot we just took above (saved to localStorage
    // by the send flow on commit failure / undo). No interim edits should overwrite it.
    sendInProgressRef.current = true;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // Close the modal and clear the local form immediately for an instant UX,
    // but keep the draft in storage until the send actually commits.
    resetForm();
    onOpenChange(false);

    const toastId = toast(`Sending to ${recipientLabel}…`, {
      description: `Will be delivered in ${Math.round(UNDO_SEND_WINDOW_MS / 1000)} seconds`,
      duration: UNDO_SEND_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelledRef.current = true;
          // Send was cancelled — release the autosave guard so editing resumes normally.
          sendInProgressRef.current = false;
          if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current);
            undoTimerRef.current = null;
          }
          // Restore content into the draft store so reopening compose brings it back
          saveDraft(snapshotDraftKey, {
            to: payload.to_email.split(',').map(s => s.trim()).filter(Boolean),
            cc: ccRecipients,
            bcc: bccRecipients,
            subject: payload.subject,
            body: payload.body_preview,
            attachments: attachments.filter(a => a.status === 'ready').map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
            showCcBcc: ccRecipients.length > 0 || bccRecipients.length > 0,
            savedAt: Date.now(),
          });
          toast.success('Send cancelled', {
            description: 'Your draft has been restored.',
            action: {
              label: 'Reopen',
              onClick: () => onOpenChange(true),
            },
          });
        },
      },
    });
    undoToastIdRef.current = toastId;

    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      if (cancelledRef.current) return;
      if (undoToastIdRef.current != null) toast.dismiss(undoToastIdRef.current);
      void performDelivery(payload, snapshotDraftKey);
    }, UNDO_SEND_WINDOW_MS);
  };

  const handleSend = () => {
    if (toRecipients.length === 0) { toast.error('Please add a recipient'); return; }
    if (attachments.some(a => a.status === 'uploading')) {
      toast.error('Please wait for attachments to finish uploading');
      return;
    }
    const passed = runChecks({
      subject,
      body,
      attachments: attachments.filter(a => a.status === 'ready').map(a => a.name),
    });
    if (passed) executeSend();
  };

  /**
   * Real upload: ask the edge function for a signed upload URL, then PUT the
   * file body via XMLHttpRequest so we can listen to `upload.onprogress` for
   * accurate progress bars. Cancellable via `xhr.abort()`.
   */
  const startUpload = async (id: string, file: File) => {
    // Helper to mark this specific attachment as failed
    const markError = (message: string) => {
      uploadXhrsRef.current.delete(id);
      setAttachments(prev =>
        prev.map(a => (a.id === id ? { ...a, status: 'error', error: message, progress: 0 } : a)),
      );
    };

    try {
      // 1) Request a signed upload URL from our edge function
      const scope = replyTo?.threadId ?? 'new';
      const { data, error } = await supabase.functions.invoke<{
        path: string;
        uploadUrl: string;
        token: string;
        bucket: string;
        error?: string;
      }>('upload-email-attachment', {
        body: { filename: file.name, size: file.size, scope },
      });

      if (error || !data || !data.uploadUrl) {
        markError(error?.message || data?.error || 'Could not start upload');
        return;
      }

      // 2) PUT the file body to the signed URL with XHR for real progress events
      const xhr = new XMLHttpRequest();
      uploadXhrsRef.current.set(id, xhr);

      xhr.open('PUT', data.uploadUrl, true);
      // Required headers for Supabase Storage signed uploads
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        const pct = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
        setAttachments(prev =>
          prev.map(a => (a.id === id && a.status === 'uploading' ? { ...a, progress: pct } : a)),
        );
      };

      xhr.onload = () => {
        uploadXhrsRef.current.delete(id);
        if (xhr.status >= 200 && xhr.status < 300) {
          setAttachments(prev =>
            prev.map(a =>
              a.id === id
                ? {
                    ...a,
                    status: 'ready',
                    progress: 100,
                    storagePath: data.path,
                    storageBucket: data.bucket,
                  }
                : a,
            ),
          );
        } else {
          markError(`Upload failed (HTTP ${xhr.status})`);
        }
      };

      xhr.onerror = () => markError('Network error during upload');
      xhr.ontimeout = () => markError('Upload timed out');
      // xhr.onabort intentionally not set — abort path removes the row entirely

      xhr.send(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected upload error';
      markError(msg);
    }
  };

  const removeAttachment = (id: string) => {
    // Abort an in-flight upload if present
    const xhr = uploadXhrsRef.current.get(id);
    if (xhr) {
      try { xhr.abort(); } catch { /* ignore */ }
      uploadXhrsRef.current.delete(id);
    }
    // Best-effort cleanup of an already-uploaded object so we don't leave
    // orphaned files in storage when the user removes an attachment they had
    // finished uploading. Failures are non-fatal.
    setAttachments(prev => {
      const target = prev.find(a => a.id === id);
      if (target?.storagePath && target.storageBucket) {
        void supabase.storage.from(target.storageBucket).remove([target.storagePath]).catch(() => {
          /* ignore — storage cleanup is best-effort */
        });
      }
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl); } catch { /* ignore */ }
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    setAttachments(prev => {
      let working = [...prev];
      const accepted: AttachmentItem[] = [];
      const errors: string[] = [];

      for (const file of incoming) {
        if (working.length + accepted.length >= MAX_ATTACHMENT_COUNT) {
          errors.push(`Maximum ${MAX_ATTACHMENT_COUNT} attachments reached`);
          break;
        }
        const result = validateFile(file, [...working, ...accepted]);
        if (result.ok === false) {
          errors.push(`${file.name}: ${result.reason}`);
          continue;
        }
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ext = getExtension(file.name);
        // For images, an object URL is an instant, free thumbnail. For PDFs we
        // generate the preview asynchronously after the row is committed.
        const isImage = IMAGE_PREVIEW_EXTENSIONS.has(ext);
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
        accepted.push({
          id,
          name: file.name,
          size: file.size,
          type: file.type || `application/${getExtension(file.name) || 'octet-stream'}`,
          file,
          status: 'uploading',
          progress: 0,
          previewUrl,
          previewKind: isImage ? 'image' : undefined,
        });
      }

      if (errors.length > 0) {
        toast.error(errors.length === 1 ? errors[0] : `${errors.length} files rejected`, {
          description: errors.length > 1 ? errors.slice(0, 3).join(' • ') : undefined,
        });
      }
      if (accepted.length > 0) {
        toast.success(`Attached ${accepted.length} file${accepted.length > 1 ? 's' : ''}`);
        // Kick off uploads after state commits
        setTimeout(() => {
          accepted.forEach(a => a.file && startUpload(a.id, a.file));
        }, 0);
        // Generate PDF thumbnails in the background (small files only).
        accepted.forEach(a => {
          if (!a.file) return;
          if (getExtension(a.name) !== 'pdf') return;
          if (a.file.size > PDF_PREVIEW_MAX_BYTES) return;
          void generatePdfThumbnail(a.file).then(url => {
            if (!url) return;
            setAttachments(prev =>
              prev.map(item =>
                item.id === a.id
                  ? { ...item, previewUrl: url, previewKind: 'pdf' }
                  : item,
              ),
            );
          });
        });
      }
      working = [...working, ...accepted];
      return working;
    });
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = ''; // allow re-selecting the same file
  };

  // Drag-and-drop handlers (use depth counter for reliable enter/leave)
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDiscard = () => {
    clearDraft(draftKey);
    clearHistory(historyKey);
    setHistory([]);
    resetForm();
    onOpenChange(false);
    toast.info('Draft discarded');
  };

  /** Explicitly flush the current form state to the draft store, bypassing the autosave debounce. */
  const handleSaveDraftNow = () => {
    // Cancel any pending debounced save
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const draft: ComposeDraft = {
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      attachments: attachments
        .filter(a => a.status === 'ready')
        .map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
      showCcBcc,
      savedAt: Date.now(),
    };

    if (!isDraftMeaningful(draft)) {
      toast.info('Nothing to save', {
        description: 'Add a recipient, subject, message, or attachment first.',
      });
      return;
    }

    setAutosaveStatus('saving');
    const ok = saveDraft(draftKey, draft);
    if (ok) {
      setAutosaveStatus('saved');
      setHistory(pushHistoryEntry(historyKey, draft));
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
      toast.success('Draft saved');
    } else {
      setAutosaveStatus('idle');
      toast.error('Could not save draft', {
        description: 'Your browser storage may be full. Try removing attachments and retry.',
      });
    }
  };

  /** Apply a historical draft snapshot to the current form. */
  const handleRestoreVersion = (entry: DraftHistoryEntry) => {
    const d = entry.draft;
    // Snapshot the CURRENT state into history first so the user can undo the restore
    const currentDraft: ComposeDraft = {
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      attachments: attachments
        .filter(a => a.status === 'ready')
        .map(a => ({ id: a.id, name: a.name, size: a.size, type: a.type })),
      showCcBcc,
      savedAt: Date.now(),
    };
    if (isDraftMeaningful(currentDraft)) {
      setHistory(pushHistoryEntry(historyKey, currentDraft));
    }

    // Suppress the next debounced autosave so restoring doesn't immediately overwrite history again
    skipNextAutosaveRef.current = true;
    setToRecipients(d.to ?? []);
    setCcRecipients(d.cc ?? []);
    setBccRecipients(d.bcc ?? []);
    setSubject(d.subject ?? '');
    setBody(d.body ?? '');
    setAttachments(
      (d.attachments ?? []).map(a => ({
        id: a.id,
        name: a.name,
        size: a.size,
        type: a.type,
        status: 'ready' as const,
        progress: 100,
      })),
    );
    setShowCcBcc(d.showCcBcc ?? (d.cc?.length > 0 || d.bcc?.length > 0));

    // Persist as the active draft
    saveDraft(draftKey, { ...d, savedAt: Date.now() });
    setAutosaveStatus('saved');
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);

    setHistoryOpen(false);
    toast.success('Draft version restored', {
      description: `Restored snapshot from ${formatRelativeTime(d.savedAt)}.`,
    });
  };

  const handleClearHistory = () => {
    clearHistory(historyKey);
    setHistory([]);
    toast.info('Version history cleared');
  };

  /** Plain-text preview of a draft body, collapsed to a single line. */
  const previewLine = (text: string, max = 80): string => {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= max) return collapsed;
    return collapsed.slice(0, max - 1) + '…';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Closing via X / overlay: preserve the draft (don't clear), just close.
        // Sending and Discard handle their own clearing.
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col sm:rounded-xl",
          // Mobile: ~96vw x ~93dvh
          "w-[96vw] h-[93dvh] max-w-[97vw] max-h-[94dvh]",
          // Tablet (>= 640px): ~94vw x 90dvh
          "sm:w-[94vw] sm:h-[90dvh] sm:max-w-[94vw] sm:max-h-[92dvh]",
          // Desktop (>= 1024px): ~92vw x 88dvh, capped at 1400 x 980
          "lg:w-[min(92vw,1400px)] lg:h-[min(88dvh,980px)] lg:max-w-[1400px] lg:max-h-[980px]",
        )}
      >
        {/* Header */}
        <DialogHeader
          className="shrink-0 border-b"
          style={{ padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
          <DialogTitle className="text-base sm:text-lg">
            {replyTo ? 'Reply' : 'New Message'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {replyTo ? `Replying to ${replyTo.to_name}` : 'Compose and send an email'}
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file input for the Attach button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_EXTENSIONS.map(e => `.${e}`).join(',')}
          onChange={handleFileInputChange}
        />

        {/* Scrollable body — also serves as the drop zone */}
        <div
          className="relative flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{ padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 1.75rem)' }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div
              className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm"
              aria-hidden="true"
            >
              <Upload className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-primary">Drop files to attach</p>
              <p className="text-xs text-muted-foreground">
                Up to {MAX_ATTACHMENT_COUNT} files · {formatBytes(MAX_FILE_SIZE_BYTES)} each
              </p>
            </div>
          )}
          <div className="space-y-3">
          {/* To field */}
          <div className="flex items-center gap-2">
            <RecipientField
              label="To"
              recipients={toRecipients}
              onChange={setToRecipients}
              search={search}
              placeholder="recipient@example.com"
              className="flex-1"
              labelClassName="w-10"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7 px-2 shrink-0"
              onClick={() => setShowCcBcc(!showCcBcc)}
            >
              Cc/Bcc
              {showCcBcc ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          </div>

          {/* Cc/Bcc fields */}
          {showCcBcc && (
            <>
              <RecipientField
                label="Cc"
                recipients={ccRecipients}
                onChange={setCcRecipients}
                search={search}
                placeholder="cc@example.com"
                labelClassName="w-10"
              />
              <RecipientField
                label="Bcc"
                recipients={bccRecipients}
                onChange={setBccRecipients}
                search={search}
                placeholder="bcc@example.com"
                labelClassName="w-10"
              />
            </>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-10 shrink-0">Subj</Label>
            <Input
              ref={subjectInputRef}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium"
            />
          </div>
        </div>

          <Separator className="my-1" />

          {/* Body — grows to fill remaining space inside the scrollable region */}
          <div className="flex-1 min-h-[200px] flex flex-col">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message..."
              className="flex-1 min-h-[200px] border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent"
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
                  {' · '}
                  {formatBytes(attachments.reduce((s, a) => s + a.size, 0))}
                </span>
              </div>
              <ul className="space-y-1.5">
                {attachments.map(att => (
                  <li
                    key={att.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs',
                      att.status === 'error' && 'border-destructive/40 bg-destructive/5',
                    )}
                  >
                    <div
                      className={cn(
                        'relative h-9 w-9 shrink-0 overflow-hidden rounded border bg-background flex items-center justify-center',
                        att.status === 'error' && 'border-destructive/40',
                      )}
                      aria-hidden
                    >
                      {att.previewUrl ? (
                        <img
                          src={att.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : att.status === 'error' ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      {att.status === 'uploading' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{att.name}</span>
                        <span className="text-muted-foreground shrink-0">
                          {formatBytes(att.size)}
                        </span>
                      </div>
                      {att.status === 'uploading' && (
                        <Progress value={att.progress} className="mt-1 h-1" />
                      )}
                      {att.status === 'error' && att.error && (
                        <p className="mt-0.5 text-[11px] text-destructive">{att.error}</p>
                      )}
                    </div>
                    {att.status === 'uploading' && (
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                        {Math.round(att.progress)}%
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t flex flex-wrap items-center gap-2"
          style={{ padding: 'clamp(0.625rem, 1.25vw, 1rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
          <Button
            onClick={handleSend}
            disabled={isSending}
            size="sm"
            className="gap-1.5"
          >
            {isSending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={openFilePicker}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Attach
          </Button>

          <div className="flex-1 min-w-0" />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleSaveDraftNow}
            disabled={autosaveStatus === 'saving'}
            aria-label="Save draft now"
          >
            <Save className="h-3.5 w-3.5" />
            Save draft
          </Button>

          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={history.length === 0}
                aria-label="View draft version history"
                title={history.length === 0 ? 'No saved versions yet' : 'Draft version history'}
              >
                <History className="h-3.5 w-3.5" />
                History
                {history.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 px-1.5 text-[10px] font-normal tabular-nums"
                  >
                    {history.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-[360px] p-0"
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Draft history</p>
                  <p className="text-[11px] text-muted-foreground">
                    Last {DRAFT_HISTORY_MAX_ENTRIES} autosaved versions
                  </p>
                </div>
                {history.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={handleClearHistory}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {history.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No saved versions yet. Edits are captured automatically as you type.
                </div>
              ) : (
                <ScrollArea className="max-h-[320px]">
                  <ul className="divide-y">
                    {history.map((entry, idx) => {
                      const d = entry.draft;
                      const subjLine = d.subject.trim() || '(No subject)';
                      const bodyLine = previewLine(d.body) || '(Empty message)';
                      const recipientCount =
                        (d.to?.length ?? 0) + (d.cc?.length ?? 0) + (d.bcc?.length ?? 0);
                      return (
                        <li
                          key={entry.id}
                          className="px-3 py-2.5 text-xs hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium tabular-nums text-muted-foreground">
                                  {formatRelativeTime(d.savedAt)}
                                </span>
                                {idx === 0 && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                    Latest
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 truncate font-medium text-foreground">
                                {subjLine}
                              </p>
                              <p className="truncate text-muted-foreground">
                                {bodyLine}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
                                {d.attachments.length > 0 && (
                                  <> · {d.attachments.length} attachment{d.attachments.length === 1 ? '' : 's'}</>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 h-7 gap-1 px-2 text-[11px]"
                              onClick={() => handleRestoreVersion(entry)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              )}
            </PopoverContent>
          </Popover>

          {autosaveStatus !== 'idle' && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 px-1">
              {autosaveStatus === 'saving' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving draft…
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 text-success" />
                  Draft saved
                </>
              )}
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleDiscard}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={executeSend}
        onAddAttachment={() => { clearPreSendAlert(); openFilePicker(); }}
        onAddSubject={() => { clearPreSendAlert(); subjectInputRef.current?.focus(); }}
      />
    </Dialog>
  );
}

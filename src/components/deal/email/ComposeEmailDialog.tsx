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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  History,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { RecipientField, emailStringToArray } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void | Promise<void>;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
}

const COMPOSE_DRAFT_PREFIX = 'compose_draft_';
const COMPOSE_AUTOSAVE_DEBOUNCE_MS = 800;

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
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
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
  const uploadTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
  const { search } = useEmailContacts();

  // Focus & keyboard navigation refs
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Decide which field should hold initial focus when the modal opens.
   * - New empty message → To field
   * - Reply (To prefilled) → body textarea so the user can start typing
   * - Otherwise → first empty meaningful field
   */
  const shouldFocusBodyOnOpen = !!(replyTo?.to_email || toRecipients.length > 0);

  const draftKey = useMemo(() => getDraftKey(replyTo?.threadId), [replyTo?.threadId]);
  const hasRestoredRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(false);

  // Pending draft awaiting user confirmation (Restore vs Start fresh)
  const [pendingDraft, setPendingDraft] = useState<ComposeDraft | null>(null);

  /**
   * On open: detect any saved draft. If meaningful, hold it in `pendingDraft`
   * and show the restore prompt. Otherwise just mark the open as handled.
   * We do NOT auto-restore — the user explicitly chooses.
   */
  useEffect(() => {
    if (!open) {
      hasRestoredRef.current = false;
      setPendingDraft(null);
      return;
    }
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = loadDraft(draftKey);
    if (saved && isDraftMeaningful(saved)) {
      setPendingDraft(saved);
    }
  }, [open, draftKey]);

  /** Apply a saved draft to the form state. */
  const applyDraft = (saved: ComposeDraft) => {
    skipNextAutosaveRef.current = true;
    setToRecipients(saved.to ?? (replyTo?.to_email ? [replyTo.to_email] : []));
    setCcRecipients(saved.cc ?? []);
    setBccRecipients(saved.bcc ?? []);
    setSubject(saved.subject ?? (replyTo ? `Re: ${replyTo.subject}` : ''));
    setBody(saved.body ?? '');
    // Restored attachments only retain metadata — File blob is gone after reload.
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
    setShowCcBcc(saved.showCcBcc ?? ((saved.cc?.length ?? 0) > 0 || (saved.bcc?.length ?? 0) > 0));
    setAutosaveStatus('saved');
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
  };

  const handleRestoreDraft = () => {
    if (pendingDraft) applyDraft(pendingDraft);
    setPendingDraft(null);
  };

  const handleDiscardSavedDraft = () => {
    clearDraft(draftKey);
    setPendingDraft(null);
    // Reset autosave guard: the next typing should re-establish a fresh draft.
    skipNextAutosaveRef.current = true;
    setAutosaveStatus('idle');
  };

  // Debounced autosave whenever form content changes (only while open)
  useEffect(() => {
    if (!open) return;
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
        if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2000);
      } else {
        setAutosaveStatus('idle');
      }
    }, COMPOSE_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [open, draftKey, toRecipients, ccRecipients, bccRecipients, subject, body, attachments, showCcBcc]);

  // Flush save on tab close / refresh
  useEffect(() => {
    if (!open) return;
    const handler = () => {
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
      // Cancel any in-flight (simulated) uploads
      uploadTimersRef.current.forEach(t => clearInterval(t));
      uploadTimersRef.current.clear();
    };
  }, []);

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

  const executeSend = async () => {
    clearPreSendAlert();
    if (toRecipients.length === 0) {
      toast.error('Please add a recipient');
      return;
    }

    setIsSending(true);

    const toEmail = toRecipients[0];
    const recipientName = toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    await onSend({
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
    });

    setIsSending(false);
    clearDraft(draftKey);
    resetForm();
    onOpenChange(false);
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

  /** Simulate an upload with progress (replace with real XHR/fetch upload for production). */
  const startUpload = (id: string, file: File) => {
    // Roughly simulate upload time based on file size: ~2MB/s, min 600ms, max 6s
    const totalMs = Math.min(6000, Math.max(600, (file.size / (2 * 1024 * 1024)) * 1000));
    const tickMs = 100;
    const increment = (tickMs / totalMs) * 100;

    const interval = setInterval(() => {
      setAttachments(prev =>
        prev.map(a => {
          if (a.id !== id || a.status !== 'uploading') return a;
          const next = Math.min(100, a.progress + increment);
          if (next >= 100) {
            const t = uploadTimersRef.current.get(id);
            if (t) clearInterval(t);
            uploadTimersRef.current.delete(id);
            return { ...a, progress: 100, status: 'ready' };
          }
          return { ...a, progress: next };
        }),
      );
    }, tickMs);
    uploadTimersRef.current.set(id, interval);
  };

  const removeAttachment = (id: string) => {
    const timer = uploadTimersRef.current.get(id);
    if (timer) {
      clearInterval(timer);
      uploadTimersRef.current.delete(id);
    }
    setAttachments(prev => prev.filter(a => a.id !== id));
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
        accepted.push({
          id,
          name: file.name,
          size: file.size,
          type: file.type || `application/${getExtension(file.name) || 'octet-stream'}`,
          file,
          status: 'uploading',
          progress: 0,
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
    resetForm();
    onOpenChange(false);
    toast.info('Draft discarded');
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
        ref={dialogContentRef}
        className={cn(
          "p-0 gap-0 overflow-hidden flex flex-col sm:rounded-xl",
          // Mobile: ~96vw x ~93dvh
          "w-[96vw] h-[93dvh] max-w-[97vw] max-h-[94dvh]",
          // Tablet (>= 640px): ~94vw x 90dvh
          "sm:w-[94vw] sm:h-[90dvh] sm:max-w-[94vw] sm:max-h-[92dvh]",
          // Desktop (>= 1024px): ~92vw x 88dvh, capped at 1400 x 980
          "lg:w-[min(92vw,1400px)] lg:h-[min(88dvh,980px)] lg:max-w-[1400px] lg:max-h-[980px]",
        )}
        // Override Radix's default initial-focus (would land on the X close button).
        // We pick the most useful field ourselves below.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Defer one frame so the field refs are mounted
          requestAnimationFrame(() => {
            if (shouldFocusBodyOnOpen) {
              bodyTextareaRef.current?.focus();
            }
            // Otherwise the To field handles its own autoFocus via prop
          });
        }}
        // Keyboard shortcuts within the modal.
        // Note: Radix FocusScope already handles Tab/Shift-Tab cycling, so we
        // only add discoverable shortcuts here without re-implementing trapping.
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter → Send
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            sendButtonRef.current?.click();
            return;
          }
          // Cmd/Ctrl+Shift+C → toggle Cc/Bcc
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            e.stopPropagation();
            setShowCcBcc(v => !v);
            return;
          }
        }}
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
              autoFocus={!shouldFocusBodyOnOpen}
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
              ref={bodyTextareaRef}
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
                    {att.status === 'error' ? (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    ) : att.status === 'uploading' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
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
            ref={sendButtonRef}
            onClick={handleSend}
            disabled={isSending}
            size="sm"
            className="gap-1.5"
            aria-keyshortcuts="Meta+Enter Control+Enter"
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

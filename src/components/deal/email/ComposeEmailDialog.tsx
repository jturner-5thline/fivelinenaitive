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

  const draftKey = useMemo(() => getDraftKey(replyTo?.threadId), [replyTo?.threadId]);
  const hasRestoredRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(false);

  // Restore any saved draft when the dialog opens
  useEffect(() => {
    if (!open) {
      hasRestoredRef.current = false;
      return;
    }
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = loadDraft(draftKey);
    if (saved && isDraftMeaningful(saved)) {
      skipNextAutosaveRef.current = true;
      setToRecipients(saved.to ?? (replyTo?.to_email ? [replyTo.to_email] : []));
      setCcRecipients(saved.cc ?? []);
      setBccRecipients(saved.bcc ?? []);
      setSubject(saved.subject ?? (replyTo ? `Re: ${replyTo.subject}` : ''));
      setBody(saved.body ?? '');
      setAttachments(saved.attachments ?? []);
      setShowCcBcc(saved.showCcBcc ?? (saved.cc?.length > 0 || saved.bcc?.length > 0));
      setAutosaveStatus('saved');
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus('idle'), 2500);
    }
  }, [open, draftKey, replyTo]);

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
      attachments,
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
        attachments,
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
    const passed = runChecks({ subject, body, attachments });
    if (passed) executeSend();
  };

  const handleAddAttachment = () => {
    const fakeNames = ['proposal.pdf', 'financials.xlsx', 'term_sheet.docx', 'deck.pptx', 'summary.pdf'];
    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    if (!attachments.includes(randomName)) {
      setAttachments(prev => [...prev, randomName]);
      toast.info(`Attached: ${randomName}`);
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

        {/* Scrollable body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col"
          style={{ padding: 'clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 1.75rem)' }}
        >
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
            <div className="pt-3">
              <div className="flex flex-wrap gap-2">
                {attachments.map(name => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="text-xs gap-1.5 pr-1 py-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    {name}
                    <button
                      onClick={() => setAttachments(prev => prev.filter(a => a !== name))}
                      className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
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
            onClick={handleAddAttachment}
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
        onAddAttachment={() => { clearPreSendAlert(); handleAddAttachment(); }}
        onAddSubject={() => { clearPreSendAlert(); subjectInputRef.current?.focus(); }}
      />
    </Dialog>
  );
}

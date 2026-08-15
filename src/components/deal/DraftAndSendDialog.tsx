import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, X, MessageSquare, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { EmailRichTextEditor } from './email/EmailRichTextEditor';
import { RecipientField } from './email/RecipientField';
import { DealLinkPicker } from './DealLinkPicker';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { supabase } from '@/integrations/supabase/client';
import { useActivityLog } from '@/hooks/useActivityLog';

export interface DraftAndSendInitial {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain-text body from the AI draft. Will be converted to HTML. */
  body?: string;
  /** Pre-rendered HTML body. Takes precedence over `body` when provided. */
  bodyHtml?: string;
  /** When set, the composer surfaces a thread picker scoped to this deal. */
  dealId?: string;
  /** Files to pre-attach (e.g. the freshly generated status report PDF). */
  attachments?: File[];
  /** Optional pre-selected thread id (Gmail `thread_id`). When provided and
   *  it matches a fetched thread, the composer opens replying into it. */
  initialThreadId?: string;
}

interface DraftAndSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: DraftAndSendInitial | null;
  /** Friendly label for the toast/header (e.g. "Client follow-up"). */
  contextLabel?: string;
  onSent?: () => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Convert the AI's plain-text draft into safe HTML paragraphs. */
function plainTextToHtml(text: string): string {
  if (!text) return '';
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) =>
      `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br />')}</p>`,
    );
  return blocks.join('');
}

/** Heuristic: treat a string as HTML if it contains any tag-like markup.
 *  Saved email signatures (e.g. the default 5th Line block) ship as HTML and
 *  must NOT be escaped — otherwise the composer renders literal `<p>` /
 *  `<strong>` text instead of formatted content. */
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

/** Render a signature for the rich-text editor. Accepts either HTML
 *  (returned as-is) or plain text (converted to escaped paragraphs). */
function renderSignatureHtml(sig: string | undefined): string {
  if (!sig || !sig.trim()) return '';
  return looksLikeHtml(sig) ? sig : plainTextToHtml(sig);
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file (Gmail cap)

interface ThreadOption {
  thread_id: string;
  latest_message_id: string;
  subject: string;
  from: string;
  received_at: string | null;
}

export function DraftAndSendDialog({
  open,
  onOpenChange,
  initial,
  contextLabel,
  onSent,
}: DraftAndSendDialogProps) {
  const { search } = useEmailContacts();
  const signature = useUserEmailSignature();
  const { sendEmail } = useGmail();
  const { logActivity } = useActivityLog(initial?.dealId);

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [threads, setThreads] = useState<ThreadOption[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('new');
  const [linkedDealId, setLinkedDealId] = useState<string | null>(null);
  const seededRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seed once when the dialog opens with a fresh draft.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current || !initial) return;
    seededRef.current = true;
    setTo(initial.to ?? []);
    setCc(initial.cc ?? []);
    setBcc(initial.bcc ?? []);
    setShowCcBcc(((initial.cc?.length ?? 0) + (initial.bcc?.length ?? 0)) > 0);
    setSubject(initial.subject ?? '');
    const bodyHtml = initial.bodyHtml && initial.bodyHtml.trim().length > 0
      ? initial.bodyHtml
      : plainTextToHtml(initial.body ?? '');
    const sigHtml = renderSignatureHtml(signature);
    // Blank paragraph keeps a visible separator line between body & signature.
    setBody(sigHtml ? `${bodyHtml}<p><br/></p>${sigHtml}` : bodyHtml);
    setFiles(initial.attachments ?? []);
    setSelectedThreadId(initial.initialThreadId ?? 'new');
    setLinkedDealId(initial.dealId ?? null);
  }, [open, initial, signature]);

  // Load relevant threads for this deal so the user can reply into an existing one.
  useEffect(() => {
    let cancelled = false;
    if (!open || !initial?.dealId) {
      setThreads([]);
      return;
    }
    (async () => {
      try {
        const { data: links } = await supabase
          .from('deal_emails')
          .select('gmail_message_id')
          .eq('deal_id', initial.dealId);
        const ids = (links || []).map((l: any) => l.gmail_message_id).filter(Boolean);
        if (ids.length === 0) {
          if (!cancelled) setThreads([]);
          return;
        }
        const { data: msgs } = await supabase
          .from('gmail_messages')
          .select('gmail_message_id, thread_id, subject, from_email, from_name, received_at')
          .in('gmail_message_id', ids);
        // Group by thread_id, keep latest per thread.
        const byThread = new Map<string, ThreadOption>();
        for (const m of (msgs || []) as any[]) {
          if (!m.thread_id) continue;
          const existing = byThread.get(m.thread_id);
          const ts = m.received_at ? new Date(m.received_at).getTime() : 0;
          const existingTs = existing?.received_at ? new Date(existing.received_at).getTime() : 0;
          if (!existing || ts >= existingTs) {
            byThread.set(m.thread_id, {
              thread_id: m.thread_id,
              latest_message_id: m.gmail_message_id,
              subject: m.subject || '(no subject)',
              from: m.from_name || m.from_email || '',
              received_at: m.received_at,
            });
          }
        }
        const list = Array.from(byThread.values()).sort((a, b) => {
          const at = a.received_at ? new Date(a.received_at).getTime() : 0;
          const bt = b.received_at ? new Date(b.received_at).getTime() : 0;
          return bt - at;
        });
        if (!cancelled) setThreads(list.slice(0, 25));
      } catch {
        if (!cancelled) setThreads([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, initial?.dealId]);

  const handleThreadChange = (val: string) => {
    setSelectedThreadId(val);
    if (val === 'new') return;
    const t = threads.find((x) => x.thread_id === val);
    if (!t) return;
    const subj = t.subject.trim();
    const reSubj = /^re:\s/i.test(subj) ? subj : `Re: ${subj}`;
    setSubject(reSubj);
  };

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const handleAttachClick = () => fileInputRef.current?.click();
  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.name} is over the 25 MB limit`);
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  };
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // Pull the most recent archived Status Report for this deal out of the
  // Internal Data Room and attach it to the draft.
  const [isAttachingReport, setIsAttachingReport] = useState(false);
  const handleAttachLatestStatusReport = async () => {
    if (!initial?.dealId) return;
    setIsAttachingReport(true);
    try {
      const { data, error } = await (supabase as any)
        .from('vdr_documents')
        .select('filename, file_path, file_type, file_size, created_at')
        .eq('deal_id', initial.dealId)
        .eq('is_folder', false)
        .eq('folder_path', '/Status Reports/')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const doc = data?.[0];
      if (!doc) {
        toast.error('No status report found for this deal yet');
        return;
      }
      if (files.some((f) => f.name === doc.filename)) {
        toast.info('Latest status report is already attached');
        return;
      }
      const { data: blob, error: dlError } = await supabase.storage
        .from('vdr-files')
        .download(doc.file_path);
      if (dlError || !blob) throw dlError || new Error('Download failed');
      if (blob.size > MAX_FILE_BYTES) {
        toast.error('Status report is over the 25 MB limit');
        return;
      }
      const file = new File([blob], doc.filename, {
        type: doc.file_type || blob.type || 'application/octet-stream',
      });
      setFiles((prev) => [...prev, file]);
      toast.success('Latest status report attached');
    } catch (e: any) {
      toast.error(e?.message || 'Could not attach the status report');
    } finally {
      setIsAttachingReport(false);
    }
  };

  // Block send while any pre-attached file is still empty (e.g. the generated
  // status report PDF hasn't finished rendering). Prevents shipping a chip
  // with an empty payload.
  const hasEmptyAttachment = files.some((f) => !f.size || f.size === 0);
  const canSend =
    to.length > 0 && subject.trim().length > 0 && !isSending && !hasEmptyAttachment;

  const formatBytes = (n: number): string => {
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${n} B`;
  };

  const handleSend = async () => {
    if (!canSend) {
      if (to.length === 0) toast.error('Add at least one recipient');
      else if (!subject.trim()) toast.error('Add a subject');
      return;
    }
    setIsSending(true);
    try {
      const replyToMessageId =
        selectedThreadId !== 'new'
          ? threads.find((t) => t.thread_id === selectedThreadId)?.latest_message_id
          : undefined;
      const result = await sendEmail({
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: subject.trim(),
        bodyHtml: body,
        attachments: files.length > 0 ? files : undefined,
        replyToMessageId,
      });
      if (!result) throw new Error('Send failed');
      if (initial?.dealId) {
        logActivity(
          'email_sent',
          `Email sent to ${to.join(', ')} — ${subject.trim()}`,
          {
            to,
            cc: cc.length > 0 ? cc : undefined,
            bcc: bcc.length > 0 ? bcc : undefined,
            subject: subject.trim(),
            context: contextLabel,
            thread_id: selectedThreadId !== 'new' ? selectedThreadId : undefined,
            attachment_count: files.length,
            status: 'sent',
            sent_at: new Date().toISOString(),
          },
        );
      }
      toast.success(contextLabel ? `${contextLabel} sent` : 'Email sent');
      onOpenChange(false);
      onSent?.();
    } catch (e: any) {
      toast.error(e?.message || 'Could not send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleDiscard = () => {
    if (isSending) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleDiscard())}>
      <DialogContent className="popup-shell-surface max-w-3xl w-[92vw] h-[88vh] flex flex-col p-0 overflow-hidden border-transparent glass-border-soft shadow-2xl shadow-black/20 rounded-2xl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            {contextLabel ? `Draft & Send · ${contextLabel}` : 'Draft & Send'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review the AI draft, edit anything you'd like, then send from your connected mailbox.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Recipients */}
          <div className="px-5 pt-3 space-y-2">
            {/* Linked-to-deal pill: shows which deal this email is associated with
                (drives recognition for future inbound mail). Editing writes a
                recognition_overrides row keyed on the first recipient. */}
            <DealLinkPicker
              dealId={linkedDealId}
              recipients={to}
              onLinkedDealChange={(newDealId) => setLinkedDealId(newDealId)}
            />
            {threads.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Thread
                </span>
                <Select value={selectedThreadId} onValueChange={handleThreadChange}>
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Send as new thread" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="new">Send as new thread</SelectItem>
                    {threads.map((t) => (
                      <SelectItem key={t.thread_id} value={t.thread_id}>
                        <span className="truncate max-w-[420px] inline-block align-middle">
                          {t.subject}
                          {t.from ? ` · ${t.from}` : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <RecipientField
                  label="To"
                  recipients={to}
                  onChange={setTo}
                  search={search}
                  placeholder="recipient@example.com"
                />
              </div>
              {!showCcBcc && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setShowCcBcc(true)}
                >
                  Cc / Bcc
                </Button>
              )}
            </div>
            {showCcBcc && (
              <>
                <RecipientField label="Cc" recipients={cc} onChange={setCc} search={search} />
                <RecipientField label="Bcc" recipients={bcc} onChange={setBcc} search={search} />
              </>
            )}
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground w-12">Subject</span>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 px-5 py-3">
            <EmailRichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Compose your email…"
              minHeight={300}
              className="h-full"
            />
          </div>

          {/* Attachments */}
          {files.length > 0 && (
            <div className="px-5 pb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <Badge key={`${f.name}-${i}`} variant="secondary" className="gap-1 pr-1">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {f.size > 0 ? formatBytes(f.size) : 'empty'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-1 rounded hover:bg-muted/60 p-0.5"
                    aria-label="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <span className="text-[11px] text-muted-foreground self-center">
                Total {formatBytes(totalBytes)}
              </span>
              {hasEmptyAttachment && (
                <span className="text-[11px] text-destructive self-center">
                  Attachment is still generating — please wait.
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleAttachClick}
              >
                <Paperclip className="h-3.5 w-3.5 mr-1.5" />
                Attach
              </Button>
              {initial?.dealId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={isAttachingReport}
                  onClick={handleAttachLatestStatusReport}
                >
                  {isAttachingReport ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Latest status report
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={handleDiscard}
                disabled={isSending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="liquid-glass"
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleSend}
                disabled={!canSend}
              >
                {isSending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-3.5 w-3.5 mr-1.5" /> Send</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
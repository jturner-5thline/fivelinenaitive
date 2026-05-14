import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, Send, X } from 'lucide-react';
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
import { toast } from 'sonner';
import { EmailRichTextEditor } from './email/EmailRichTextEditor';
import { RecipientField } from './email/RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';

export interface DraftAndSendInitial {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain-text body from the AI draft. Will be converted to HTML. */
  body: string;
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

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file (Gmail cap)

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

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
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
    const bodyHtml = plainTextToHtml(initial.body ?? '');
    const sigHtml = signature ? plainTextToHtml(signature) : '';
    setBody(sigHtml ? `${bodyHtml}<p></p>${sigHtml}` : bodyHtml);
    setFiles([]);
  }, [open, initial, signature]);

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

  const canSend = to.length > 0 && subject.trim().length > 0 && !isSending;

  const handleSend = async () => {
    if (!canSend) {
      if (to.length === 0) toast.error('Add at least one recipient');
      else if (!subject.trim()) toast.error('Add a subject');
      return;
    }
    setIsSending(true);
    try {
      const result = await sendEmail({
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: subject.trim(),
        bodyHtml: body,
        attachments: files.length > 0 ? files : undefined,
      });
      if (!result) throw new Error('Send failed');
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
      <DialogContent className="max-w-3xl w-[92vw] h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
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
                {(totalBytes / (1024 * 1024)).toFixed(1)} MB
              </span>
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
                size="sm"
                className="h-8"
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
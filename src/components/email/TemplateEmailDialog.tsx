import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from '@/components/deal/email/EmailComposerCard';
import { EmailTemplatePicker } from '@/components/email/EmailTemplatePicker';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-filled recipients + token values for the template. */
  defaults: { to: string[]; subject?: string; label?: string } | null;
  /** Extra tokens available to templates (merged with recipient_name). */
  tokens?: Record<string, string>;
  title?: string;
}

/**
 * Two-step email flow: pick a pre-configured template, then review/edit the
 * pre-populated message before sending.
 */
export function TemplateEmailDialog({ open, onClose, defaults, tokens = {}, title = 'Send email' }: Props) {
  const signature = useUserEmailSignature();
  const { sendEmail } = useGmail();

  const [recipients, setRecipients] = useState<ComposerRecipients>({ to: [], cc: [], bcc: [] });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<'template' | 'compose'>('template');
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);

  useEffect(() => {
    if (open && defaults) {
      setRecipients({ to: defaults.to, cc: [], bcc: [] });
      setSubject(defaults.subject || '');
      setBody('');
      setAttachments([]);
      setFiles([]);
      setStep('template');
      setTemplateTitle(null);
    }
  }, [open, defaults]);

  const handleSend = useCallback(async (_o: ComposerSendOptions) => {
    if (recipients.to.length === 0) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    try {
      const result = await sendEmail({
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
        subject: subject.trim(),
        bodyHtml: body,
        body: body.replace(/<[^>]+>/g, ''),
        attachments: files.length > 0 ? files : undefined,
      });
      if (!result) throw new Error('Send failed');
      toast.success(`Email sent to ${defaults?.label || recipients.to[0]}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    }
  }, [recipients, subject, body, files, sendEmail, onClose, defaults]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-[640px] p-0 border"
        style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <DialogTitle className="text-[15px] font-semibold tracking-tight text-white">
            {step === 'template' ? 'Choose an email template' : title}
          </DialogTitle>
          {step === 'compose' && templateTitle && (
            <p className="text-[11px] text-white/50">
              Using template: {templateTitle} ·{' '}
              <button type="button" className="underline hover:text-white" onClick={() => setStep('template')}>
                change
              </button>
            </p>
          )}
        </DialogHeader>
        <div className="p-3">
          {step === 'template' ? (
            <EmailTemplatePicker
              tokens={{ recipient_name: defaults?.label || '', ...tokens }}
              onPick={(t) => {
                if (t.subject) setSubject(t.subject);
                setBody(t.bodyHtml || '');
                setTemplateTitle(t.title);
                setStep('compose');
              }}
              onSkip={() => { setTemplateTitle(null); setStep('compose'); }}
            />
          ) : (
            <EmailComposerCard
              replyToName={defaults?.label || ''}
              hideReplyAnchor
              recipients={recipients}
              onRecipientsChange={setRecipients}
              subject={subject}
              onSubjectChange={setSubject}
              body={body}
              onBodyChange={setBody}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onFilesChange={setFiles}
              onSend={handleSend}
              onDiscard={() => { onClose(); toast.info('Draft discarded'); }}
              signature={signature}
              variant="inline"
              showSubject
              className="rounded-lg border border-white/10 shadow-none mx-0 my-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Send,
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  ArrowLeft,
  Bold,
  Italic,
  Link,
  List,
  ListOrdered,
  Save,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import { EmailTemplatePicker } from './EmailTemplatePicker';
import { AiDraftPopover } from './AiDraftPopover';
import { RecipientField, emailArrayToString } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';

interface InlineComposePanelProps {
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void | Promise<void>;
  onClose: () => void;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
}

export function InlineComposePanel({ onSend, onClose, replyTo }: InlineComposePanelProps) {
  const [toRecipients, setToRecipients] = useState<string[]>(replyTo?.to_email ? [replyTo.to_email] : []);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
  const { search } = useEmailContacts();

  const resetForm = () => {
    setToRecipients(replyTo?.to_email ? [replyTo.to_email] : []);
    setCcRecipients([]);
    setBccRecipients([]);
    setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
    setBody('');
    setShowCcBcc(false);
    setAttachments([]);
  };

  const executeSend = async () => {
    clearPreSendAlert();
    if (toRecipients.length === 0) { toast.error('Please add a recipient'); return; }
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
    resetForm();
    onClose();
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

  // Formatting helpers
  const insertFormatting = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const newBody = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    setBody(newBody);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const handleBold = () => insertFormatting('**', '**');
  const handleItalic = () => insertFormatting('*', '*');
  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) insertFormatting('[', `](${url})`);
  };
  const handleBulletList = () => insertFormatting('- ', '\n');
  const handleNumberedList = () => insertFormatting('1. ', '\n');
  const handleSaveDraft = () => toast.success('Draft saved');

  // AI Draft handler - replaced by AiDraftPopover

  const handleDiscard = () => {
    resetForm();
    onClose();
    toast.info('Draft discarded');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with back arrow */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/60">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{replyTo ? 'Reply' : 'New Message'}</span>
      </div>

      <div className="flex-1 flex flex-col overflow-auto">
        <div className="px-5 py-3 space-y-3">
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

        <Separator />

        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 px-5 h-8 border-b border-border">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBold}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleItalic}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleLink}>
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBulletList}>
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNumberedList}>
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <AiDraftPopover
            trigger={
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1">
                <Sparkles className="h-3 w-3" />
                AI Draft
              </Button>
            }
            onDraftGenerated={(draft) => setBody(draft)}
            currentSubject={subject}
            currentTo={toRecipients.join(', ')}
          />
          <Separator orientation="vertical" className="h-4 mx-1" />
          <EmailTemplatePicker
            onInsert={(templateSubject, templateBody) => {
              if (templateSubject && !subject) setSubject(templateSubject);
              if (templateBody) setBody(templateBody);
            }}
          />
        </div>

        {/* Body */}
        <div className="px-5 py-3 flex-1">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message..."
            className="min-h-[200px] h-full border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent"
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-5 pb-2">
            <div className="flex flex-wrap gap-2">
              {attachments.map(name => (
                <Badge key={name} variant="secondary" className="text-xs gap-1.5 pr-1 py-1">
                  <Paperclip className="h-3 w-3" />
                  {name}
                  <button onClick={() => setAttachments(prev => prev.filter(a => a !== name))} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-5 py-3 shrink-0">
        <Button onClick={handleSend} disabled={isSending} size="sm" className="gap-1.5">
          {isSending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending...</>
          ) : (
            <><Send className="h-3.5 w-3.5" />Send</>
          )}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveDraft}>
          <Save className="h-3.5 w-3.5" />Save Draft
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleAddAttachment}>
          <Paperclip className="h-3.5 w-3.5" />Attach
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDiscard}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={executeSend}
        onAddAttachment={() => { clearPreSendAlert(); handleAddAttachment(); }}
        onAddSubject={() => { clearPreSendAlert(); subjectInputRef.current?.focus(); }}
      />
    </div>
  );
}

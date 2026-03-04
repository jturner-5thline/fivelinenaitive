import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Send,
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Check,
  AlertCircle,
  Cloud,
  Bold,
  Italic,
  Link,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import { SnippetPicker } from './SnippetPicker';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';

export interface ReplyDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: string[];
  threadId: string;
  toName: string;
}

interface InlineReplyComposerProps {
  replyTo: { subject: string; to_email: string; to_name: string; threadId: string };
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void;
  onDiscard: () => void;
  onPopOut: (draft: ReplyDraft) => void;
  initialDraft?: ReplyDraft | null;
  onDraftChange?: (draft: ReplyDraft) => void;
  onFieldBlur?: () => void;
  saveStatus?: DraftSaveStatus;
  tokenContext?: TokenContext;
}

function DraftStatusIndicator({ status }: { status: DraftSaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className={cn(
      'flex items-center gap-1 text-[10px] transition-opacity duration-300',
      status === 'saving' && 'text-muted-foreground',
      status === 'saved' && 'text-success',
      status === 'error' && 'text-destructive',
    )}>
      {status === 'saving' && <><Cloud className="h-2.5 w-2.5 animate-pulse" />Saving…</>}
      {status === 'saved' && <><Check className="h-2.5 w-2.5" />Draft saved</>}
      {status === 'error' && <><AlertCircle className="h-2.5 w-2.5" />Save failed</>}
    </span>
  );
}

export function InlineReplyComposer({ replyTo, onSend, onDiscard, onPopOut, initialDraft, onDraftChange, onFieldBlur, saveStatus = 'idle', tokenContext }: InlineReplyComposerProps) {
  const [to, setTo] = useState(initialDraft?.to ?? replyTo.to_email);
  const [cc, setCc] = useState(initialDraft?.cc ?? '');
  const [bcc, setBcc] = useState(initialDraft?.bcc ?? '');
  const [subject, setSubject] = useState(initialDraft?.subject ?? `Re: ${replyTo.subject}`);
  const [body, setBody] = useState(initialDraft?.body ?? '');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>(initialDraft?.attachments ?? []);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  const getCurrentDraft = useCallback((): ReplyDraft => ({
    to, cc, bcc, subject, body, attachments,
    threadId: replyTo.threadId,
    toName: replyTo.to_name,
  }), [to, cc, bcc, subject, body, attachments, replyTo]);

  useEffect(() => {
    onDraftChange?.(getCurrentDraft());
  }, [to, cc, bcc, subject, body, attachments]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasContent = body.trim().length > 0 || attachments.length > 0;

  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();

  const executeSend = async () => {
    clearPreSendAlert();
    if (!to.trim()) { toast.error('Please add a recipient'); return; }

    setIsSending(true);
    await new Promise(r => setTimeout(r, 1200));

    const recipientName = to.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    onSend({
      subject,
      from_name: 'You',
      from_email: 'jturner@5thline.co',
      to_name: recipientName,
      to_email: to.trim(),
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
    toast.success('Email sent successfully', { description: `To: ${to}`, icon: '✉️' });
  };

  const handleSend = () => {
    if (!to.trim()) { toast.error('Please add a recipient'); return; }
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

  const handleInsertSnippet = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newBody = body.slice(0, start) + text + body.slice(end);
      setBody(newBody);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } else {
      setBody(prev => prev + text);
    }
  }, [body]);

  // Fix #11: formatting helpers
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

  const defaultTokenContext: TokenContext = tokenContext || {
    recipientName: replyTo.to_name,
    recipientEmail: replyTo.to_email,
    senderName: 'You',
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBlur = () => {
    onFieldBlur?.();
  };

  const discardButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        {hasContent ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your in-progress email. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction onClick={onDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDiscard}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Discard draft</TooltipContent>
    </Tooltip>
  );

  return (
    <div className={cn(
      'border-t bg-card flex flex-col transition-all duration-200',
      expanded ? 'max-h-[60vh]' : 'max-h-[280px]'
    )}>
      {/* Header bar with controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 cursor-default select-none">
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs font-medium text-foreground flex-1">
          Reply to {replyTo.to_name}
        </span>
        <DraftStatusIndicator status={saveStatus} />
        {/* Fix #15: Tooltips on expand/pop-out icons */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)}>
              {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{expanded ? 'Collapse composer' : 'Expand composer'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onPopOut(getCurrentDraft())}>
              <Maximize2 className="h-3 w-3 rotate-90" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Pop out to window</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => hasContent ? undefined : onDiscard()}>
              {hasContent ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <span className="inline-flex"><X className="h-3 w-3" /></span>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Discard draft?</AlertDialogTitle>
                      <AlertDialogDescription>Your in-progress email will be permanently deleted.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep editing</AlertDialogCancel>
                      <AlertDialogAction onClick={onDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <X className="h-3 w-3" onClick={onDiscard} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Close</TooltipContent>
        </Tooltip>
      </div>

      {/* Fields */}
      <div className="px-4 py-2 space-y-1.5 overflow-y-auto flex-shrink-0">
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground w-8 shrink-0">To</Label>
          <Input
            value={to}
            onChange={e => setTo(e.target.value)}
            onBlur={handleBlur}
            placeholder="recipient@example.com"
            className="h-7 text-xs border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent"
          />
          <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6 px-1.5 shrink-0" onClick={() => setShowCcBcc(!showCcBcc)}>
            Cc/Bcc {showCcBcc ? <ChevronUp className="h-2.5 w-2.5 ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 ml-0.5" />}
          </Button>
        </div>
        {showCcBcc && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground w-8 shrink-0">Cc</Label>
              <Input value={cc} onChange={e => setCc(e.target.value)} onBlur={handleBlur} placeholder="cc@example.com" className="h-7 text-xs border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground w-8 shrink-0">Bcc</Label>
              <Input value={bcc} onChange={e => setBcc(e.target.value)} onBlur={handleBlur} placeholder="bcc@example.com" className="h-7 text-xs border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent" />
            </div>
          </>
        )}
      </div>

      {/* Fix #11: Formatting toolbar */}
      <div className="flex items-center gap-1 px-4 h-7 border-b border-border">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBold}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleItalic}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleLink}>
          <Link className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="px-4 flex-1 min-h-0">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Write your reply..."
          className={cn(
            'border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent w-full',
            expanded ? 'min-h-[200px] h-full' : 'min-h-[80px]'
          )}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 pb-1.5">
          <div className="flex flex-wrap gap-1.5">
            {attachments.map(name => (
              <Badge key={name} variant="secondary" className="text-[10px] gap-1 pr-1 py-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                {name}
                <button onClick={() => setAttachments(prev => prev.filter(a => a !== name))} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/20">
        <Button onClick={handleSend} disabled={isSending} size="sm" className="gap-1.5 h-7 text-xs">
          {isSending ? (
            <><Loader2 className="h-3 w-3 animate-spin" />Sending...</>
          ) : (
            <><Send className="h-3 w-3" />Send</>
          )}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-7 text-xs" onClick={handleAddAttachment}>
          <Paperclip className="h-3 w-3" />Attach
        </Button>
        <SnippetPicker onInsert={handleInsertSnippet} tokenContext={defaultTokenContext} />
        {/* Fix #12: kbd badge for shortcut hint */}
        <kbd className="text-[10px] bg-muted border border-border rounded px-1 py-0.5 text-muted-foreground ml-1">⌘↵</kbd>
        <div className="flex-1" />
        {discardButton}
      </div>

      <PreSendAlertDialog
        alert={preSendAlert}
        onClose={clearPreSendAlert}
        onSendAnyway={executeSend}
        onAddAttachment={() => { clearPreSendAlert(); handleAddAttachment(); }}
        onAddSubject={() => { clearPreSendAlert(); }}
      />
    </div>
  );
}

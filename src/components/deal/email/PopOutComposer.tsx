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
  Minimize2,
  Maximize2,
  GripHorizontal,
  Minus,
  Check,
  AlertCircle,
  Cloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';
import type { ReplyDraft } from './InlineReplyComposer';
import { SnippetPicker } from './SnippetPicker';
import { usePreSendChecks } from './usePreSendChecks';
import { PreSendAlertDialog } from './PreSendAlertDialog';
import type { DraftSaveStatus } from '@/hooks/useEmailDraft';
import type { TokenContext } from '@/hooks/useEmailSnippets';
import { RecipientField, emailStringToArray, emailArrayToString } from './RecipientField';
import { useEmailContacts } from '@/hooks/useEmailContacts';

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

interface PopOutComposerProps {
  draft: ReplyDraft;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void;
  onDiscard: () => void;
  onPopIn: (draft: ReplyDraft) => void;
  onDraftChange?: (draft: ReplyDraft) => void;
  onFieldBlur?: () => void;
  saveStatus?: DraftSaveStatus;
  tokenContext?: TokenContext;
}

export function PopOutComposer({ draft: initialDraft, onSend, onDiscard, onPopIn, onDraftChange, onFieldBlur, saveStatus = 'idle', tokenContext }: PopOutComposerProps) {
  const [toRecipients, setToRecipients] = useState<string[]>(emailStringToArray(initialDraft.to));
  const [ccRecipients, setCcRecipients] = useState<string[]>(emailStringToArray(initialDraft.cc));
  const [bccRecipients, setBccRecipients] = useState<string[]>(emailStringToArray(initialDraft.bcc));
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>(initialDraft.attachments);
  const [minimized, setMinimized] = useState(false);
  const { search } = useEmailContacts();

  // Dragging
  const [position, setPosition] = useState({ x: window.innerWidth - 520, y: window.innerHeight - 480 });
  const [size, setSize] = useState({ width: 480, height: 400 });
  const dragRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

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

  const defaultTokenContext: TokenContext = tokenContext || {
    recipientName: initialDraft.toName,
    recipientEmail: initialDraft.to,
    senderName: 'You',
  };

  const getCurrentDraft = useCallback((): ReplyDraft => ({
    to: emailArrayToString(toRecipients), cc: emailArrayToString(ccRecipients), bcc: emailArrayToString(bccRecipients), subject, body, attachments,
    threadId: initialDraft.threadId,
    toName: initialDraft.toName,
  }), [toRecipients, ccRecipients, bccRecipients, subject, body, attachments, initialDraft]);

  // Notify parent of draft changes
  useEffect(() => {
    onDraftChange?.(getCurrentDraft());
  }, [toRecipients, ccRecipients, bccRecipients, subject, body, attachments]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasContent = body.trim().length > 0 || attachments.length > 0;

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragStart.current.y)),
      });
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, size.width]);

  const { alert: preSendAlert, runChecks, clearAlert: clearPreSendAlert } = usePreSendChecks();
  const subjectInputRef = useRef<HTMLInputElement>(null);

  const executeSend = async () => {
    clearPreSendAlert();
    if (toRecipients.length === 0) { toast.error('Please add a recipient'); return; }

    setIsSending(true);
    await new Promise(r => setTimeout(r, 1200));

    const toEmail = toRecipients[0];
    const recipientName = toEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    onSend({
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
    toast.success('Email sent successfully', { description: `To: ${toRecipients.join(', ')}`, icon: '✉️' });
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBlur = () => {
    onFieldBlur?.();
  };

  const confirmDiscard = hasContent ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive">
          <X className="h-3 w-3" />
        </Button>
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
    <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive" onClick={onDiscard}>
      <X className="h-3 w-3" />
    </Button>
  );

  if (minimized) {
    return (
      <div
        className="fixed z-50 bottom-0 right-4 bg-card border border-border rounded-t-lg shadow-2xl cursor-pointer"
        style={{ width: 300 }}
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-foreground flex-1 truncate">
            Reply to {initialDraft.toName}
          </span>
          <DraftStatusIndicator status={saveStatus} />
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setMinimized(false); }}>
            <Maximize2 className="h-3 w-3" />
          </Button>
          {confirmDiscard}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        minWidth: 360,
        minHeight: 300,
      }}
    >
      {/* Drag header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          Reply to {initialDraft.toName}
        </span>
        <DraftStatusIndicator status={saveStatus} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMinimized(true)}>
              <Minus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Minimize</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onPopIn(getCurrentDraft())}>
              <Minimize2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Back to inline</TooltipContent>
        </Tooltip>
        {confirmDiscard}
      </div>

      {/* Fields */}
      <div className="px-3 py-2 space-y-1.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <RecipientField
            label="To"
            recipients={toRecipients}
            onChange={setToRecipients}
            search={search}
            placeholder="recipient@example.com"
            className="flex-1"
            labelClassName="w-8"
            inputClassName="h-7 text-xs"
            onBlur={handleBlur}
          />
          <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground h-6 px-1.5 shrink-0" onClick={() => setShowCcBcc(!showCcBcc)}>
            Cc/Bcc {showCcBcc ? <ChevronUp className="h-2.5 w-2.5 ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 ml-0.5" />}
          </Button>
        </div>
        {showCcBcc && (
          <>
            <RecipientField
              label="Cc"
              recipients={ccRecipients}
              onChange={setCcRecipients}
              search={search}
              className="flex-1"
              labelClassName="w-8"
              inputClassName="h-7 text-xs"
              onBlur={handleBlur}
            />
            <RecipientField
              label="Bcc"
              recipients={bccRecipients}
              onChange={setBccRecipients}
              search={search}
              className="flex-1"
              labelClassName="w-8"
              inputClassName="h-7 text-xs"
              onBlur={handleBlur}
            />
          </>
        )}
        <div className="flex items-center gap-2">
          <Label className="text-[11px] text-muted-foreground w-8 shrink-0">Subj</Label>
          <Input ref={subjectInputRef} value={subject} onChange={e => setSubject(e.target.value)} onBlur={handleBlur} className="h-7 text-xs border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium" />
        </div>
      </div>

      {/* Body */}
      <div className="px-3 flex-1 min-h-0 overflow-y-auto">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Write your reply..."
          className="border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent w-full h-full min-h-[100px]"
          autoFocus
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-3 pb-1.5">
          <div className="flex flex-wrap gap-1.5">
            {attachments.map(name => (
              <Badge key={name} variant="secondary" className="text-[10px] gap-1 pr-1 py-0.5">
                <Paperclip className="h-2.5 w-2.5" />{name}
                <button onClick={() => setAttachments(prev => prev.filter(a => a !== name))} className="ml-0.5 rounded-full hover:bg-muted p-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/20">
        <Button onClick={handleSend} disabled={isSending} size="sm" className="gap-1.5 h-7 text-xs">
          {isSending ? <><Loader2 className="h-3 w-3 animate-spin" />Sending...</> : <><Send className="h-3 w-3" />Send</>}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-7 text-xs" onClick={handleAddAttachment}>
          <Paperclip className="h-3 w-3" />Attach
        </Button>
        <SnippetPicker onInsert={handleInsertSnippet} tokenContext={defaultTokenContext} />
        <span className="text-[10px] text-muted-foreground ml-1">⌘↵ to send</span>
        <div className="flex-1" />
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
                <AlertDialogDescription>Your in-progress email will be permanently deleted.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction onClick={onDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDiscard}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startW = size.width;
          const startH = size.height;
          const onMove = (ev: MouseEvent) => {
            setSize({
              width: Math.max(360, startW + (ev.clientX - startX)),
              height: Math.max(300, startH + (ev.clientY - startY)),
            });
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <svg className="h-4 w-4 text-muted-foreground/30" viewBox="0 0 16 16">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" />
          <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
        </svg>
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

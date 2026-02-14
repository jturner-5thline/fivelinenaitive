import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import {
  Send,
  Paperclip,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockEmail } from './mockEmailData';

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (email: Omit<MockEmail, 'id' | 'threadId'>) => void;
  replyTo?: { subject: string; to_email: string; to_name: string; threadId: string } | null;
}

export function ComposeEmailDialog({ open, onOpenChange, onSend, replyTo }: ComposeEmailDialogProps) {
  const [to, setTo] = useState(replyTo?.to_email || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);

  const resetForm = () => {
    setTo(replyTo?.to_email || '');
    setCc('');
    setBcc('');
    setSubject(replyTo ? `Re: ${replyTo.subject}` : '');
    setBody('');
    setShowCcBcc(false);
    setAttachments([]);
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error('Please add a recipient');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please add a subject');
      return;
    }

    setIsSending(true);

    // Simulate sending delay
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
    toast.success('Email sent successfully', {
      description: `To: ${to}`,
      icon: '✉️',
    });
    resetForm();
    onOpenChange(false);
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
    resetForm();
    onOpenChange(false);
    toast.info('Draft discarded');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">
            {replyTo ? 'Reply' : 'New Message'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {replyTo ? `Replying to ${replyTo.to_name}` : 'Compose and send an email'}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="px-5 py-3 space-y-3">
          {/* To field */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-10 shrink-0">To</Label>
            <Input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent"
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
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-10 shrink-0">Cc</Label>
                <Input
                  value={cc}
                  onChange={e => setCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-10 shrink-0">Bcc</Label>
                <Input
                  value={bcc}
                  onChange={e => setBcc(e.target.value)}
                  placeholder="bcc@example.com"
                  className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent"
                />
              </div>
            </>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-10 shrink-0">Subj</Label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
              className="h-8 text-sm border-0 border-b rounded-none focus-visible:ring-0 px-0 bg-transparent font-medium"
            />
          </div>
        </div>

        <Separator />

        {/* Body */}
        <div className="px-5 py-3">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message..."
            className="min-h-[200px] border-0 resize-none focus-visible:ring-0 p-0 text-sm bg-transparent"
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="px-5 pb-2">
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

        <Separator />

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 py-3">
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

          <div className="flex-1" />

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
    </Dialog>
  );
}

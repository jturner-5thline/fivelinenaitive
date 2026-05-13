import { useState } from 'react';
import { Mail, Send, Edit3, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

interface EmailDraft {
  to_name: string;
  to_email?: string;
  subject: string;
  body: string;
}

interface Props {
  draft: EmailDraft;
  onSend?: (prompt: string) => void;
}

export function EmailDraftCard({ draft, onSend }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.body);

  const handleSend = () => {
    if (!draft.to_email) {
      toast.error('No recipient email provided');
      return;
    }
    const sendPrompt = `Send that email to ${draft.to_email}`;
    onSend?.(sendPrompt);
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  return (
    <Card className="mt-2 overflow-hidden border-border/40 bg-muted/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-xs font-medium">Email Draft</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? <X className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
            {isEditing ? 'Cancel' : 'Edit'}
          </Button>
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={handleSend}
          >
            <Send className="h-3 w-3" />
            Send
          </Button>
        </div>
      </div>

      {/* Meta */}
      <div className="px-3 py-1.5 text-[11px] space-y-0.5 border-b border-border/20">
        <div className="flex gap-2">
          <span className="text-muted-foreground w-8">To:</span>
          <span>{draft.to_name}{draft.to_email ? ` <${draft.to_email}>` : ''}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground w-8">Subj:</span>
          <span className="font-medium">{draft.subject}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              className="text-xs min-h-[100px] resize-y"
            />
            <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setIsEditing(false); toast.success('Draft updated'); }}>
              <Check className="h-3 w-3" /> Apply
            </Button>
          </div>
        ) : (
          <div
            className="text-xs text-muted-foreground leading-relaxed max-h-[150px] overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.body.includes('<') ? draft.body : `<p>${draft.body}</p>`, { USE_PROFILES: { html: true } }) }}
          />
        )}
      </div>
    </Card>
  );
}

/** Parse email draft JSON from assistant message content */
export function extractEmailDraft(content: string): EmailDraft | null {
  // Look for ```json blocks with draft data
  const jsonMatch = content.match(/```json\s*(\{[\s\S]*?"subject"[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.subject && parsed.body) return parsed as EmailDraft;
    } catch {}
  }
  return null;
}

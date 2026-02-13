import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Star,
  Paperclip,
  Link2,
  Unlink,
  ChevronLeft,
} from 'lucide-react';
import { MockEmail } from './mockEmailData';
import { toast } from 'sonner';

interface EmailListProps {
  emails: MockEmail[];
  selectedEmail: MockEmail | null;
  onSelect: (email: MockEmail) => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
}

export function EmailList({ emails, selectedEmail, onSelect, onToggleLink, onToggleStar }: EmailListProps) {
  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-12 text-center">
        <p className="text-sm text-muted-foreground">No emails in this folder</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="divide-y divide-border">
        {emails.map((email) => (
          <div
            key={email.id}
            className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
              selectedEmail?.id === email.id ? 'bg-muted' : ''
            } ${!email.is_read ? 'bg-primary/5' : ''}`}
            onClick={() => onSelect(email)}
          >
            <div className="flex items-start gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(email); }}
                className="mt-0.5 shrink-0"
              >
                <Star className={`h-4 w-4 ${email.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40 hover:text-muted-foreground'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${!email.is_read ? 'font-semibold' : 'font-medium'}`}>
                    {email.folder === 'sent' ? `To: ${email.to_name || email.to_email}` : email.from_name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className={`text-sm truncate ${!email.is_read ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
                    {email.subject}
                  </p>
                  {email.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{email.snippet}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {email.is_linked_to_deal && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      <Link2 className="h-2.5 w-2.5 mr-0.5" />
                      Linked
                    </Badge>
                  )}
                  {email.labels.map(l => (
                    <Badge key={l} variant="outline" className="text-[10px] h-4 px-1.5">{l}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

interface EmailDetailProps {
  email: MockEmail;
  onBack: () => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
}

export function EmailDetail({ email, onBack, onToggleLink, onToggleStar }: EmailDetailProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{email.subject}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => onToggleStar(email)}>
            <Star className={`h-4 w-4 ${email.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
          </Button>
          <Button
            variant={email.is_linked_to_deal ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onToggleLink(email)}
          >
            {email.is_linked_to_deal ? (
              <><Unlink className="h-3.5 w-3.5 mr-1.5" />Unlink</>
            ) : (
              <><Link2 className="h-3.5 w-3.5 mr-1.5" />Link to Deal</>
            )}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                {(email.folder === 'sent' ? email.to_name : email.from_name).charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {email.folder === 'sent' ? `To: ${email.to_name || email.to_email}` : email.from_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {email.folder === 'sent' ? email.to_email : email.from_email}
                </p>
              </div>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {format(new Date(email.received_at), 'MMM d, yyyy h:mm a')}
          </span>
        </div>

        <Separator />

        <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
          {email.body_preview}
        </div>

        {email.has_attachments && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Attachments</p>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>document.pdf</span>
                  <span className="text-xs text-muted-foreground">2.4 MB</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

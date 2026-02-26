import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Mail, Search, RefreshCw, Star, Trash2, ArrowLeft,
  Inbox, Send, ChevronRight,
} from 'lucide-react';
import { useGmail } from '@/hooks/useGmail';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';

interface InboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InboxDialog({ open, onOpenChange }: InboxDialogProps) {
  const {
    status, messages, isLoading, error,
    listMessages, getMessage, markRead, toggleStar, trashMessage,
  } = useGmail();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (open && status.connected) {
      listMessages({ maxResults: 30 });
    }
  }, [open, status.connected, listMessages]);

  const handleSearch = () => {
    if (status.connected) {
      listMessages({ maxResults: 30, query: searchQuery || undefined });
    }
  };

  const handleSelectMessage = async (msgId: string) => {
    setSelectedMessageId(msgId);
    setLoadingDetail(true);
    const detail = await getMessage(msgId);
    setMessageDetail(detail);
    setLoadingDetail(false);
    // Mark as read
    const msg = messages.find(m => m.id === msgId);
    if (msg && !msg.is_read) {
      markRead(msgId, true);
    }
  };

  const handleBack = () => {
    setSelectedMessageId(null);
    setMessageDetail(null);
  };

  if (!status.connected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Inbox
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Connect your Gmail</p>
              <p className="text-sm text-muted-foreground mt-1">
                Link your email in Integrations to access your inbox here.
              </p>
            </div>
            <Button onClick={() => { onOpenChange(false); navigate('/integrations'); }}>
              Go to Integrations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            {selectedMessageId && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Inbox className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Inbox</h2>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Connected</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => listMessages({ maxResults: 30, query: searchQuery || undefined })}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search bar */}
        {!selectedMessageId && (
          <div className="px-4 py-2 border-b">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {selectedMessageId ? (
            // Message detail view
            <ScrollArea className="h-full">
              {loadingDetail ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Separator />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : messageDetail ? (
                <div className="p-6">
                  <div className="space-y-3 mb-4">
                    <h3 className="text-xl font-semibold text-foreground">
                      {messageDetail.subject || '(No subject)'}
                    </h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {messageDetail.from_name || messageDetail.from_email}
                      </span>
                      {messageDetail.from_name && (
                        <span className="text-muted-foreground">&lt;{messageDetail.from_email}&gt;</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>To: {(messageDetail.to_emails || []).join(', ')}</span>
                      {messageDetail.cc_emails?.length > 0 && (
                        <span>• CC: {messageDetail.cc_emails.join(', ')}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {messageDetail.received_at && format(new Date(messageDetail.received_at), 'PPpp')}
                    </div>
                  </div>
                  <Separator className="mb-4" />
                  {messageDetail.body_html ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(messageDetail.body_html),
                      }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">
                      {messageDetail.body_text || messageDetail.snippet || 'No content'}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  Failed to load message.
                </div>
              )}
            </ScrollArea>
          ) : (
            // Message list view
            <ScrollArea className="h-full">
              {isLoading && messages.length === 0 ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                <div className="p-6 text-center text-destructive">
                  <p className="text-sm">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => listMessages({ maxResults: 30 })}>
                    Retry
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No emails found.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {messages.map(msg => (
                    <button
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg.id)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        !msg.is_read && 'bg-primary/5'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn(
                            'text-sm truncate',
                            !msg.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                          )}>
                            {msg.from_name || msg.from_email}
                          </span>
                          {!msg.is_read && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                          {msg.is_starred && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                          )}
                          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(msg.received_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className={cn(
                          'text-sm truncate',
                          !msg.is_read ? 'font-medium text-foreground' : 'text-foreground/80'
                        )}>
                          {msg.subject || '(No subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {msg.snippet}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

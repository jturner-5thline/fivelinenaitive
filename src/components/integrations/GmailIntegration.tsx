import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useGmail } from '@/hooks/useGmail';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Mail,
  Send,
  Star,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Inbox,
  MailOpen,
  StarOff,
  ArrowLeft,
  PenSquare,
  Search,
} from 'lucide-react';

interface GmailIntegrationProps {
  onDisconnect?: () => void;
}

export function GmailIntegration({ onDisconnect }: GmailIntegrationProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    status,
    messages,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    checkStatus,
    listMessages,
    getMessage,
    sendEmail,
    markRead,
    toggleStar,
    trashMessage,
  } = useGmail();

  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeData, setComposeData] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
  });
  const [isSending, setIsSending] = useState(false);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const gmailCallback = searchParams.get('gmail_callback');
    
    if (code && gmailCallback) {
      exchangeCode(code).then((success) => {
        if (success) {
          toast.success('Gmail connected successfully!');
        } else {
          toast.error('Failed to connect Gmail');
        }
        // Clean up URL
        setSearchParams({});
      });
    }
  }, [searchParams, exchangeCode, setSearchParams]);

  // Load messages when connected
  useEffect(() => {
    if (status.connected && !status.is_expired) {
      listMessages();
    }
  }, [status.connected, status.is_expired, listMessages]);

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnect?.();
    toast.success('Gmail disconnected');
  };

  const handleRefresh = async () => {
    await listMessages({ query: searchQuery || undefined });
    toast.success('Messages refreshed');
  };

  const handleSearch = async () => {
    await listMessages({ query: searchQuery || undefined });
  };

  const handleViewMessage = async (messageId: string) => {
    const message = await getMessage(messageId);
    if (message) {
      setSelectedMessage(message);
      setIsViewOpen(true);
      // Mark as read
      if (!message.is_read) {
        await markRead(messageId, true);
      }
    }
  };

  const handleSendEmail = async () => {
    if (!composeData.to || !composeData.subject) {
      toast.error('To and subject are required');
      return;
    }

    setIsSending(true);
    try {
      const result = await sendEmail({
        to: composeData.to.split(',').map(e => e.trim()),
        cc: composeData.cc ? composeData.cc.split(',').map(e => e.trim()) : undefined,
        bcc: composeData.bcc ? composeData.bcc.split(',').map(e => e.trim()) : undefined,
        subject: composeData.subject,
        body: composeData.body,
      });

      if (result) {
        toast.success('Email sent successfully!');
        setIsComposeOpen(false);
        setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '' });
      } else {
        toast.error('Failed to send email');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleTrash = async (messageId: string) => {
    const success = await trashMessage(messageId);
    if (success) {
      toast.success('Message moved to trash');
      if (selectedMessage?.id === messageId) {
        setIsViewOpen(false);
        setSelectedMessage(null);
      }
    }
  };

  const handleToggleStar = async (messageId: string, currentlyStarred: boolean) => {
    await toggleStar(messageId, !currentlyStarred);
  };

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Gmail Integration</CardTitle>
              <CardDescription>Send and receive emails from your Gmail account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-6 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Connect your Gmail account</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Authorize access to send and receive emails directly from this platform.
              Your credentials are securely stored.
            </p>
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Connect Gmail
                </>
              )}
            </Button>
            {error && (
              <p className="text-sm text-destructive mt-4">{error}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Gmail</CardTitle>
                <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              </div>
              <CardDescription>
                {status.connected_at && (
                  <span>Connected {formatDistanceToNow(new Date(status.connected_at), { addSuffix: true })}</span>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsComposeOpen(true)}>
              <PenSquare className="mr-2 h-4 w-4" />
              Compose
            </Button>
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              <XCircle className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <Separator />
      
      <CardContent className="p-4">
        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button variant="secondary" onClick={handleSearch} disabled={isLoading}>
            Search
          </Button>
        </div>

        {/* Messages list */}
        <ScrollArea className="h-[400px]">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No messages found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-3 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                    !message.is_read ? 'bg-primary/5 font-medium' : ''
                  }`}
                  onClick={() => handleViewMessage(message.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStar(message.id, message.is_starred);
                        }}
                        className="mt-1"
                      >
                        {message.is_starred ? (
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ) : (
                          <StarOff className="h-4 w-4 text-muted-foreground hover:text-yellow-400" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm truncate ${!message.is_read ? 'font-semibold' : ''}`}>
                            {message.from_name || message.from_email}
                          </span>
                          {!message.is_read && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className={`text-sm truncate ${!message.is_read ? 'font-medium' : 'text-muted-foreground'}`}>
                          {message.subject || '(No subject)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {message.snippet}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {message.received_at && formatDistanceToNow(new Date(message.received_at), { addSuffix: true })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrash(message.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Compose Dialog */}
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
            <DialogDescription>Send an email from your connected Gmail account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                placeholder="recipient@example.com"
                value={composeData.to}
                onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  placeholder="cc@example.com"
                  value={composeData.cc}
                  onChange={(e) => setComposeData({ ...composeData, cc: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bcc">BCC</Label>
                <Input
                  id="bcc"
                  placeholder="bcc@example.com"
                  value={composeData.bcc}
                  onChange={(e) => setComposeData({ ...composeData, bcc: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={composeData.subject}
                onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                placeholder="Write your message..."
                rows={8}
                value={composeData.body}
                onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={isSending}>
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Message Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsViewOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <DialogTitle className="truncate">{selectedMessage?.subject || '(No subject)'}</DialogTitle>
            </div>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedMessage.from_name || selectedMessage.from_email}</p>
                  <p className="text-sm text-muted-foreground">{selectedMessage.from_email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedMessage.received_at && format(new Date(selectedMessage.received_at), 'PPp')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleStar(selectedMessage.id, selectedMessage.is_starred)}
                  >
                    {selectedMessage.is_starred ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTrash(selectedMessage.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Separator />
              <ScrollArea className="max-h-[400px]">
                {selectedMessage.body_html ? (
                  <div 
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm">{selectedMessage.body_text || selectedMessage.snippet}</pre>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

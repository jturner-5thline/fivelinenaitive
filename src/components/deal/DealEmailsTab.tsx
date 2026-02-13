import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Mail,
  Inbox,
  Send,
  FileEdit,
  Link2,
  Search,
  RefreshCw,
  PenSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MockEmail,
  EmailThread,
  mockEmails as initialMockEmails,
  groupEmailsByThread,
} from './email/mockEmailData';
import { EmailList, EmailDetail } from './email/EmailListAndDetail';
import { EmailLayoutSelector, EmailLayout } from './email/EmailLayoutSelector';
import { cn } from '@/lib/utils';

interface DealEmailsTabProps {
  dealId: string;
}

export function DealEmailsTab({ dealId }: DealEmailsTabProps) {
  const [emails, setEmails] = useState<MockEmail[]>(initialMockEmails);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [layout, setLayout] = useState<EmailLayout>(() => {
    return (localStorage.getItem('email-layout') as EmailLayout) || 'split-even';
  });

  const handleLayoutChange = (newLayout: EmailLayout) => {
    setLayout(newLayout);
    localStorage.setItem('email-layout', newLayout);
  };

  const filteredEmails = useMemo(() => {
    let filtered = emails;

    if (activeFolder === 'linked') {
      filtered = filtered.filter(e => e.is_linked_to_deal);
    } else {
      filtered = filtered.filter(e => e.folder === activeFolder);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.subject.toLowerCase().includes(q) ||
          e.from_name.toLowerCase().includes(q) ||
          e.from_email.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [emails, activeFolder, searchQuery]);

  // Re-derive selected thread when emails change
  const currentThread = useMemo(() => {
    if (!selectedThread) return null;
    const threads = groupEmailsByThread(emails);
    return threads.find(t => t.threadId === selectedThread.threadId) || null;
  }, [emails, selectedThread]);

  const handleToggleLink = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_linked_to_deal: !e.is_linked_to_deal } : e
      )
    );
    toast.success(email.is_linked_to_deal ? 'Email unlinked from deal' : 'Email linked to deal');
  };

  const handleToggleStar = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_starred: !e.is_starred } : e
      )
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
    toast.success('Inbox refreshed');
  };

  const inboxUnread = emails.filter(e => e.folder === 'inbox' && !e.is_read).length;
  const linkedCount = emails.filter(e => e.is_linked_to_deal).length;

  const listContent = (
    <EmailList
      emails={filteredEmails}
      selectedThread={currentThread}
      onSelectThread={setSelectedThread}
      onToggleLink={handleToggleLink}
      onToggleStar={handleToggleStar}
    />
  );

  const detailContent = currentThread ? (
    <EmailDetail
      thread={currentThread}
      onBack={() => setSelectedThread(null)}
      onToggleLink={handleToggleLink}
      onToggleStar={handleToggleStar}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <Mail className="h-10 w-10 text-muted-foreground/20 mb-3" />
      <p className="text-sm text-muted-foreground">Select a conversation to view</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Use keyboard shortcuts: R (reply), F (forward), L (link)</p>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Deal Emails</CardTitle>
                <Badge variant="secondary" className="text-xs">Mock</Badge>
              </div>
              <CardDescription>Email correspondence linked to this deal</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EmailLayoutSelector layout={layout} onLayoutChange={handleLayoutChange} />
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('Compose feature coming soon')}>
              <PenSquare className="mr-2 h-4 w-4" />
              Compose
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="p-0">
        <Tabs value={activeFolder} onValueChange={(v) => { setActiveFolder(v); setSelectedThread(null); }}>
          <div className="px-4 pt-3 pb-2 space-y-3">
            <TabsList className="w-full justify-start h-9">
              <TabsTrigger value="inbox" className="text-xs gap-1.5">
                <Inbox className="h-3.5 w-3.5" />
                Inbox
                {inboxUnread > 0 && (
                  <Badge variant="destructive" className="h-4 px-1 text-[10px] ml-0.5">
                    {inboxUnread}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="text-xs gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Sent
              </TabsTrigger>
              <TabsTrigger value="drafts" className="text-xs gap-1.5">
                <FileEdit className="h-3.5 w-3.5" />
                Drafts
              </TabsTrigger>
              <TabsTrigger value="linked" className="text-xs gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Linked
                {linkedCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
                    {linkedCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Layout: Split Even (50/50) */}
          {layout === 'split-even' && (
            <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
              <div className={cn('border-r', currentThread ? 'hidden md:block' : '')}>
                <TabsContent value={activeFolder} className="m-0 h-[500px]">
                  {listContent}
                </TabsContent>
              </div>
              <div className={cn(!currentThread ? 'hidden md:flex' : 'flex', 'flex-col h-[500px]')}>
                {detailContent}
              </div>
            </div>
          )}

          {/* Layout: Split Wide (30/70) */}
          {layout === 'split-wide' && (
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-[500px]">
              <div className={cn('border-r', currentThread ? 'hidden md:block' : '')}>
                <TabsContent value={activeFolder} className="m-0 h-[500px]">
                  {listContent}
                </TabsContent>
              </div>
              <div className={cn(!currentThread ? 'hidden md:flex' : 'flex', 'flex-col h-[500px]')}>
                {detailContent}
              </div>
            </div>
          )}

          {/* Layout: Slide-over */}
          {layout === 'slide-over' && (
            <>
              <div className="min-h-[500px]">
                <TabsContent value={activeFolder} className="m-0 h-[500px]">
                  {listContent}
                </TabsContent>
              </div>
              <Sheet open={!!currentThread} onOpenChange={(open) => { if (!open) setSelectedThread(null); }}>
                <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px] p-0">
                  {currentThread && (
                    <EmailDetail
                      thread={currentThread}
                      onBack={() => setSelectedThread(null)}
                      onToggleLink={handleToggleLink}
                      onToggleStar={handleToggleStar}
                    />
                  )}
                </SheetContent>
              </Sheet>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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
  mockEmails as initialMockEmails,
  getUnreadCount,
} from './email/mockEmailData';
import { EmailList, EmailDetail } from './email/EmailListAndDetail';

interface DealEmailsTabProps {
  dealId: string;
}

export function DealEmailsTab({ dealId }: DealEmailsTabProps) {
  const [emails, setEmails] = useState<MockEmail[]>(initialMockEmails);
  const [selectedEmail, setSelectedEmail] = useState<MockEmail | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const handleToggleLink = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_linked_to_deal: !e.is_linked_to_deal } : e
      )
    );
    setSelectedEmail(prev =>
      prev?.id === email.id ? { ...prev, is_linked_to_deal: !prev.is_linked_to_deal } : prev
    );
    toast.success(email.is_linked_to_deal ? 'Email unlinked from deal' : 'Email linked to deal');
  };

  const handleToggleStar = (email: MockEmail) => {
    setEmails(prev =>
      prev.map(e =>
        e.id === email.id ? { ...e, is_starred: !e.is_starred } : e
      )
    );
    setSelectedEmail(prev =>
      prev?.id === email.id ? { ...prev, is_starred: !prev.is_starred } : prev
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
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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
        <Tabs value={activeFolder} onValueChange={(v) => { setActiveFolder(v); setSelectedEmail(null); }}>
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

          <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
            <div className={`border-r ${selectedEmail ? 'hidden md:block' : ''}`}>
              <TabsContent value="inbox" className="m-0">
                <EmailList emails={filteredEmails} selectedEmail={selectedEmail} onSelect={setSelectedEmail} onToggleLink={handleToggleLink} onToggleStar={handleToggleStar} />
              </TabsContent>
              <TabsContent value="sent" className="m-0">
                <EmailList emails={filteredEmails} selectedEmail={selectedEmail} onSelect={setSelectedEmail} onToggleLink={handleToggleLink} onToggleStar={handleToggleStar} />
              </TabsContent>
              <TabsContent value="drafts" className="m-0">
                <EmailList emails={filteredEmails} selectedEmail={selectedEmail} onSelect={setSelectedEmail} onToggleLink={handleToggleLink} onToggleStar={handleToggleStar} />
              </TabsContent>
              <TabsContent value="linked" className="m-0">
                <EmailList emails={filteredEmails} selectedEmail={selectedEmail} onSelect={setSelectedEmail} onToggleLink={handleToggleLink} onToggleStar={handleToggleStar} />
              </TabsContent>
            </div>

            <div className={`${!selectedEmail ? 'hidden md:flex' : 'flex'} flex-col`}>
              {selectedEmail ? (
                <EmailDetail
                  email={selectedEmail}
                  onBack={() => setSelectedEmail(null)}
                  onToggleLink={handleToggleLink}
                  onToggleStar={handleToggleStar}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                  <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">Select an email to view</p>
                </div>
              )}
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}

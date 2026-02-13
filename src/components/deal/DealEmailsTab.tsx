import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Mail,
  Inbox,
  Send,
  FileEdit,
  Link2,
  Search,
  RefreshCw,
  PenSquare,
  Star,
  Trash2,
  Archive,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  MockEmail,
  EmailThread,
  mockEmails as initialMockEmails,
  groupEmailsByThread,
} from './email/mockEmailData';
import { EmailList, EmailDetail } from './email/EmailListAndDetail';
import { cn } from '@/lib/utils';

interface DealEmailsTabProps {
  dealId: string;
}

interface FolderItem {
  id: string;
  label: string;
  icon: typeof Inbox;
  count?: number;
  indent?: boolean;
}

export function DealEmailsTab({ dealId }: DealEmailsTabProps) {
  const [emails, setEmails] = useState<MockEmail[]>(initialMockEmails);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const inboxCount = emails.filter(e => e.folder === 'inbox').length;
  const inboxUnread = emails.filter(e => e.folder === 'inbox' && !e.is_read).length;
  const sentCount = emails.filter(e => e.folder === 'sent').length;
  const draftsCount = emails.filter(e => e.folder === 'drafts').length;
  const linkedCount = emails.filter(e => e.is_linked_to_deal).length;
  const starredCount = emails.filter(e => e.is_starred).length;

  const folders: FolderItem[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxUnread || undefined },
    { id: 'drafts', label: 'Drafts', icon: FileEdit, count: draftsCount || undefined },
    { id: 'sent', label: 'Sent Items', icon: Send, count: sentCount || undefined },
    { id: 'linked', label: 'Linked to Deal', icon: Link2, count: linkedCount || undefined },
    { id: 'starred', label: 'Starred', icon: Star, count: starredCount || undefined },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'trash', label: 'Deleted Items', icon: Trash2 },
  ];

  return (
    <Card className="overflow-hidden">
      {/* Top toolbar — Outlook style */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/20">
        <Button variant="gradient" size="sm" className="gap-1.5 text-xs h-8 px-3" onClick={() => toast.info('Compose coming soon')}>
          <PenSquare className="h-3.5 w-3.5" />
          New mail
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => toast.info('Reply coming soon')}>
              Reply
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Reply (R)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => toast.info('Delete coming soon')}>
              Delete
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => toast.info('Archive coming soon')}>
              Archive
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Archive</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => toast.info('Flag coming soon')}>
              Flag / Unflag
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Flag</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>
        <Badge variant="secondary" className="text-[10px] h-5">Mock</Badge>
      </div>

      <CardContent className="p-0">
        <div className="flex min-h-[560px]">
          {/* ─── Left: Folder sidebar ─── */}
          <div className={cn(
            'border-r flex-shrink-0 transition-all duration-200',
            sidebarCollapsed ? 'w-12' : 'w-[180px]'
          )}>
            <div className="p-2">
              {!sidebarCollapsed && (
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-7 text-xs bg-muted/30 border-border/50"
                  />
                </div>
              )}
            </div>
            <ScrollArea className="h-[500px]">
              <div className="px-1 space-y-0.5">
                {folders.map(folder => {
                  const Icon = folder.icon;
                  const isActive = activeFolder === folder.id;
                  const isDisabled = folder.id === 'archive' || folder.id === 'trash' || folder.id === 'starred';
                  return (
                    <button
                      key={folder.id}
                      onClick={() => {
                        if (!isDisabled) {
                          setActiveFolder(folder.id);
                          setSelectedThread(null);
                        } else {
                          toast.info(`${folder.label} coming soon`);
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md text-left transition-colors',
                        sidebarCollapsed ? 'px-2 py-2 justify-center' : 'px-2.5 py-1.5',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                        isDisabled && 'opacity-50'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && (
                        <>
                          <span className="text-xs flex-1 truncate">{folder.label}</span>
                          {folder.count != null && folder.count > 0 && (
                            <span className={cn(
                              'text-[10px] font-medium tabular-nums',
                              isActive ? 'text-accent-foreground' : 'text-muted-foreground'
                            )}>
                              {folder.count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ─── Middle: Email list ─── */}
          <div className={cn(
            'border-r flex-shrink-0 flex flex-col min-w-0',
            currentThread ? 'hidden md:flex md:w-[380px]' : 'flex-1 md:w-[380px]'
          )}>
            {/* List header */}
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold capitalize">
                  {activeFolder === 'linked' ? 'Linked' : activeFolder}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground">
                      <Filter className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Filter</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">Sort</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Email list */}
            <div className="flex-1 h-[500px] overflow-hidden">
              <EmailList
                emails={filteredEmails}
                selectedThread={currentThread}
                onSelectThread={setSelectedThread}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
              />
            </div>
          </div>

          {/* ─── Right: Reading pane ─── */}
          <div className={cn(
            'flex-1 flex flex-col min-w-0',
            !currentThread ? 'hidden md:flex' : 'flex'
          )}>
            {currentThread ? (
              <EmailDetail
                thread={currentThread}
                onBack={() => setSelectedThread(null)}
                onToggleLink={handleToggleLink}
                onToggleStar={handleToggleStar}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/15 mb-3" />
                <p className="text-sm text-muted-foreground">Select a conversation to read</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Keyboard shortcuts: R (reply) · F (forward) · L (link to deal)
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

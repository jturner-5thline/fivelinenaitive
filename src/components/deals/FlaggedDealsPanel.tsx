import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flag, ExternalLink, MessageSquare, User } from 'lucide-react';
import { Deal } from '@/types/deal';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';
import { DEMO_FLAGGED_LIMIT } from '@/lib/demoAccount';

interface FlaggedDealsPanelProps {
  deals: Deal[];
}

interface FlagAuthor {
  dealId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export function FlaggedDealsPanel({ deals }: FlaggedDealsPanelProps) {
  const { formatCurrencyValue } = usePreferences();
  const isDemoAccount = useIsDemoAccount();
  const flaggedDeals = useMemo(() => {
    const all = deals
      .filter((deal) => deal.isFlagged)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return isDemoAccount ? all.slice(0, DEMO_FLAGGED_LIMIT) : all;
  }, [deals, isDemoAccount]);
  const [flagAuthors, setFlagAuthors] = useState<Record<string, FlagAuthor>>({});
  const [open, setOpen] = useState(false);

  // Fetch latest flag note author for each flagged deal when panel opens
  useEffect(() => {
    if (!open || flaggedDeals.length === 0) return;

    const fetchFlagAuthors = async () => {
      const dealIds = flaggedDeals.map(d => d.id);

      // Get the latest flag note per deal
      const { data: notesData } = await supabase
        .from('deal_flag_notes' as any)
        .select('id, deal_id, user_id, created_at')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false });

      const typedNotes = (notesData || []) as unknown as { id: string; deal_id: string; user_id: string | null; created_at: string }[];

      // Get latest note per deal
      const latestPerDeal = new Map<string, { user_id: string | null; created_at: string }>();
      for (const note of typedNotes) {
        if (!latestPerDeal.has(note.deal_id)) {
          latestPerDeal.set(note.deal_id, { user_id: note.user_id, created_at: note.created_at });
        }
      }

      // For deals without flag notes, fall back to the deal owner (user_id from deals table)
      const dealsWithoutNotes = dealIds.filter(id => !latestPerDeal.has(id));
      if (dealsWithoutNotes.length > 0) {
        const { data: dealOwners } = await supabase
          .from('deals')
          .select('id, user_id, updated_at')
          .in('id', dealsWithoutNotes);

        if (dealOwners) {
          for (const d of dealOwners) {
            latestPerDeal.set(d.id, { user_id: d.user_id, created_at: d.updated_at });
          }
        }
      }

      // Get unique user IDs
      const userIds = [...new Set([...latestPerDeal.values()].map(n => n.user_id).filter(Boolean))] as string[];

      let profilesMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profilesRaw } = await supabase
          .from('profiles_public' as any)
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);

        const profiles = (profilesRaw || []) as unknown as { user_id: string; display_name: string | null; avatar_url: string | null }[];
        for (const p of profiles) {
          profilesMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        }
      }

      const authors: Record<string, FlagAuthor> = {};
      for (const [dealId, entry] of latestPerDeal) {
        if (entry.user_id) {
          const profile = profilesMap[entry.user_id];
          authors[dealId] = {
            dealId,
            userId: entry.user_id,
            displayName: profile?.display_name || null,
            avatarUrl: profile?.avatar_url || null,
            createdAt: entry.created_at,
          };
        }
      }
      setFlagAuthors(authors);
    };

    fetchFlagAuthors();
  }, [open, flaggedDeals]);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <Flag className="h-4 w-4" />
          Flagged
          {flaggedDeals.length > 0 && (
            <Badge 
              variant="destructive" 
              className="h-5 min-w-5 px-1.5 text-xs absolute -top-2 -right-2"
            >
              {flaggedDeals.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Flagged Deals ({flaggedDeals.length})
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-8rem)] mt-6 pr-4">
          {flaggedDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <Flag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No flagged deals</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Flag deals to mark them for discussion
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {flaggedDeals.map((deal) => {
                const author = flagAuthors[deal.id];
                return (
                  <Link
                    key={deal.id}
                    to={`/deal/${deal.id}`}
                    className="block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{deal.company}</h3>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {formatCurrencyValue(deal.value)}
                        </p>
                      </div>
                      <Flag className="h-4 w-4 text-destructive fill-current shrink-0 mt-1" />
                    </div>
                    
                    {deal.flagNotes ? (
                      <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border/50">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {deal.flagNotes}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 mt-3 italic">
                        No notes added
                      </p>
                    )}

                    {/* Flag author attribution */}
                    {author && (
                      <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={author.avatarUrl || undefined} />
                          <AvatarFallback className="text-[8px]">
                            {author.displayName?.[0]?.toUpperCase() || <User className="h-2.5 w-2.5" />}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          Flagged by <span className="font-medium text-foreground">{author.displayName || 'Unknown'}</span>
                        </span>
                        <span className="text-muted-foreground/60">·</span>
                        <span>{formatTimeAgo(author.createdAt)}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
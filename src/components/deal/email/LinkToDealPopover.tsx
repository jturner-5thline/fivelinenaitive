import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Briefcase, Link2, Unlink, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LinkToDealPopoverProps {
  trigger: React.ReactNode;
  currentDealName?: string;
  isLinked: boolean;
  /** Returning a Promise lets the caller await persistence before the popover closes. */
  onLinkDeal: (dealId: string, dealName: string) => void | Promise<void>;
  onUnlink: () => void | Promise<void>;
  /** Optional: deal id the AI sidebar already inferred — surfaced at the top with an "AI Suggested" badge. */
  aiSuggestedDealId?: string;
}

interface Deal {
  id: string;
  company: string;
  stage: string | null;
  status: string;
}

export function LinkToDealPopover({ trigger, currentDealName, isLinked, onLinkDeal, onUnlink, aiSuggestedDealId }: LinkToDealPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchSeq = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      loadDeals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced server-side search so we surface matches across the full active
  // pipeline (not just the first 100 alphabetical deals) within ~150ms.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      loadDeals(search.trim());
    }, search.trim() ? 150 : 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const loadDeals = async (query: string = '') => {
    const seq = ++searchSeq.current;
    setLoading(true);
    // Active = anything not archived / closed-won / closed-lost. We sort by
    // most-recently-updated so the user sees deals they're working on first.
    let req = supabase
      .from('deals')
      .select('id, company, stage, status, updated_at')
      .not('status', 'in', '(archived,closed,closed-won,closed-lost)');
    if (query) {
      req = req.ilike('company', `%${query}%`);
    }
    const { data } = await req.order('updated_at', { ascending: false }).limit(50);
    // Drop stale responses if a newer search has been issued.
    if (seq !== searchSeq.current) return;
    const mapped = (data || []).map(d => ({ ...d, company: d.company || 'Unnamed Deal' })) as Deal[];
    // Float the AI-suggested deal to the top so the user can confirm with one click.
    if (aiSuggestedDealId) {
      const idx = mapped.findIndex(d => d.id === aiSuggestedDealId);
      if (idx > 0) {
        const [hit] = mapped.splice(idx, 1);
        mapped.unshift(hit);
      }
    }
    setDeals(mapped);
    setActiveIndex(0);
    setLoading(false);
  };

  const filteredDeals = deals;

  const handleSelect = async (deal: Deal) => {
    if (linking) return;
    setLinking(true);
    // Close immediately for snappy feel; persistence is awaited separately.
    setOpen(false);
    setSearch('');
    try {
      await Promise.resolve(onLinkDeal(deal.id, deal.company));
      toast.success(`Linked to ${deal.company}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link deal');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setOpen(false);
    try {
      await Promise.resolve(onUnlink());
      toast.success('Unlinked from deal');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, Math.max(filteredDeals.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredDeals[activeIndex];
      if (target) void handleSelect(target);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[280px] p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search deals..."
              className="h-8 text-xs pl-7"
              autoFocus
            />
          </div>
        </div>

        {/* Current linked deal */}
        {isLinked && currentDealName && (
          <div className="px-2 py-1.5 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <Link2 className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs font-medium text-primary flex-1 truncate">{currentDealName}</span>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={handleUnlink}>
                <Unlink className="h-3 w-3" /> Unlink
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[240px]" ref={listRef as any}>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              {search ? 'No deals found' : 'No active deals'}
            </div>
          ) : (
            <div className="p-1">
              {filteredDeals.map((deal, idx) => {
                const isCurrentlyLinked = isLinked && currentDealName === deal.company;
                const isActive = idx === activeIndex;
                const isAiSuggested = aiSuggestedDealId === deal.id;
                return (
                  <button
                    key={deal.id}
                    onClick={() => !isCurrentlyLinked && handleSelect(deal)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                      isCurrentlyLinked
                        ? 'bg-primary/10 cursor-default'
                        : isActive
                          ? 'bg-primary/10 ring-1 ring-primary/20'
                          : 'hover:bg-muted/50'
                    )}
                  >
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{deal.company}</span>
                        {isAiSuggested && (
                          <Badge variant="secondary" className="h-3.5 px-1 text-[8px] uppercase tracking-wide">AI Suggested</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {deal.status && (
                          <span className={cn(
                            'text-[9px] px-1 rounded',
                            deal.status === 'on-track' && 'bg-emerald-500/15 text-emerald-500',
                            deal.status === 'at-risk' && 'bg-amber-500/15 text-amber-500',
                            deal.status === 'on-hold' && 'bg-slate-500/15 text-slate-400',
                            deal.status === 'off-track' && 'bg-red-500/15 text-red-500',
                          )}>
                            {deal.status.replace('-', ' ')}
                          </span>
                        )}
                        {deal.stage && (
                          <span className="text-[10px] text-muted-foreground">{deal.stage}</span>
                        )}
                      </div>
                    </div>
                    {isCurrentlyLinked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
              <div className="px-2 pt-1.5 pb-1 text-[9px] text-muted-foreground/60 border-t mt-1">
                ↑↓ navigate · Enter to link · Esc to close
              </div>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

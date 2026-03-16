import { useState, useEffect, useMemo } from 'react';
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
  onLinkDeal: (dealId: string, dealName: string) => void;
  onUnlink: () => void;
}

interface Deal {
  id: string;
  company: string;
  stage: string | null;
  status: string;
}

export function LinkToDealPopover({ trigger, currentDealName, isLinked, onLinkDeal, onUnlink }: LinkToDealPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && deals.length === 0) {
      loadDeals();
    }
  }, [open]);

  const loadDeals = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('deals')
      .select('id, company, stage, status')
      .eq('status', 'active')
      .order('company')
      .limit(100);
    if (data) {
      setDeals(data.map(d => ({ ...d, company: d.company || 'Unnamed Deal' })));
    }
    setLoading(false);
  };

  const filteredDeals = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase();
    return deals.filter(d => d.company.toLowerCase().includes(q));
  }, [deals, search]);

  const handleSelect = (deal: Deal) => {
    onLinkDeal(deal.id, deal.company);
    toast.success(`Linked to ${deal.company}`);
    setOpen(false);
    setSearch('');
  };

  const handleUnlink = () => {
    onUnlink();
    toast.success('Unlinked from deal');
    setOpen(false);
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

        <ScrollArea className="max-h-[240px]">
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
              {filteredDeals.map(deal => {
                const isCurrentlyLinked = isLinked && currentDealName === deal.company;
                return (
                  <button
                    key={deal.id}
                    onClick={() => !isCurrentlyLinked && handleSelect(deal)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                      isCurrentlyLinked ? 'bg-primary/10 cursor-default' : 'hover:bg-muted/50'
                    )}
                  >
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">{deal.company}</span>
                      {deal.stage && (
                        <span className="text-[10px] text-muted-foreground">{deal.stage}</span>
                      )}
                    </div>
                    {isCurrentlyLinked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

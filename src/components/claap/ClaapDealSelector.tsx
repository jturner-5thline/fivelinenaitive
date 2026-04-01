import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ClaapDealSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (dealId: string, dealName: string) => void;
  title?: string;
  suggestedDealIds?: string[];
}

export function ClaapDealSelector({ open, onOpenChange, onSelect, title = 'Select a Deal', suggestedDealIds }: ClaapDealSelectorProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const { data: deals, isLoading } = useQuery({
    queryKey: ['claap-deal-search', search],
    queryFn: async () => {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!member?.company_id) return [];

      let query = supabase
        .from('deals')
        .select('id, company, status, stage')
        .eq('company_id', member.company_id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (search.trim()) {
        query = query.ilike('company', `%${search.trim()}%`);
      }

      const { data } = await query;
      return data || [];
    },
    enabled: open && !!user,
  });

  const suggestedDeals = deals?.filter(d => suggestedDealIds?.includes(d.id)) || [];
  const otherDeals = deals?.filter(d => !suggestedDealIds?.includes(d.id)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <ScrollArea className="max-h-[300px]">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {suggestedDeals.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground px-1 py-1">Suggested Matches</p>
                  {suggestedDeals.map(deal => (
                    <Button
                      key={deal.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-2 px-2"
                      onClick={() => { onSelect(deal.id, deal.company); onOpenChange(false); }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-medium text-sm truncate flex-1 text-left">{deal.company}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0 border-green-500/30 text-green-600">Suggested</Badge>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{deal.status}</Badge>
                      </div>
                    </Button>
                  ))}
                  {otherDeals.length > 0 && (
                    <p className="text-xs font-medium text-muted-foreground px-1 py-1 mt-2">All Deals</p>
                  )}
                </>
              )}
              {otherDeals.map(deal => (
                <Button
                  key={deal.id}
                  variant="ghost"
                  className="w-full justify-start h-auto py-2 px-2"
                  onClick={() => { onSelect(deal.id, deal.company); onOpenChange(false); }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="font-medium text-sm truncate flex-1 text-left">{deal.company}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{deal.status}</Badge>
                  </div>
                </Button>
              ))}
              {!isLoading && (!deals || deals.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No deals found</p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

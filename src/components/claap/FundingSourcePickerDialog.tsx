import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (lenderId: string, lenderName: string) => void;
  excludeIds?: string[];
}

/** Searchable funding source (master_lenders) picker used to link Claap recordings. */
export function FundingSourcePickerDialog({ open, onOpenChange, onSelect, excludeIds = [] }: Props) {
  const [search, setSearch] = useState('');

  const { data: lenders = [], isLoading } = useQuery({
    queryKey: ['funding-source-picker'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('master_lenders')
        .select('id, name, website')
        .order('name')
        .limit(2000);
      return (data || []) as { id: string; name: string; website: string | null }[];
    },
  });

  const filtered = useMemo(() => {
    const excluded = new Set(excludeIds);
    const q = search.trim().toLowerCase();
    return lenders
      .filter((l) => !excluded.has(l.id))
      .filter((l) => !q || (l.name || '').toLowerCase().includes(q) || (l.website || '').toLowerCase().includes(q))
      .slice(0, 200);
  }, [lenders, search, excludeIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[75vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link to funding source</DialogTitle>
          <DialogDescription>Search the funding source directory to link this recording.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search funding sources..."
            className="pl-8 h-9"
          />
        </div>
        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No funding sources found.</p>
          ) : (
            <div className="space-y-1 py-1">
              {filtered.map((l) => (
                <Button
                  key={l.id}
                  variant="ghost"
                  className="w-full justify-start h-auto py-2 text-left"
                  onClick={() => { onSelect(l.id, l.name); onOpenChange(false); }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{l.name}</span>
                    {l.website && <span className="block truncate text-[11px] text-muted-foreground">{l.website}</span>}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

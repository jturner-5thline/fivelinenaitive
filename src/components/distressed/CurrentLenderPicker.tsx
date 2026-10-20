import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Landmark, X, ChevronDown, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  lenderId?: string | null;
  lenderName?: string | null;
  onChange: (lender: { id: string; name: string } | null) => void;
  className?: string;
}

/** Single-select picker over the Funding Source Directory. */
export function CurrentLenderPicker({ lenderId, lenderName, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: lenders = [], isLoading } = useQuery({
    queryKey: ['current-lender-picker'],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('master_lenders').select('id, name').order('name').limit(3000);
      return (data || []) as { id: string; name: string }[];
    },
  });
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return lenders.filter((l) => !s || (l.name || '').toLowerCase().includes(s)).slice(0, 150);
  }, [lenders, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-left', className)}
        >
          <Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn('flex-1 truncate', !lenderName && 'text-muted-foreground')}>{lenderName || 'Select funding source'}</span>
          {lenderId ? (
            <span
              role="button"
              aria-label="Clear current lender"
              className="rounded p-0.5 hover:bg-muted"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search funding sources..." className="h-8 pl-7 text-sm" />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No funding sources found.</p>
          ) : filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => { onChange({ id: l.id, name: l.name }); setOpen(false); }}
              className={cn('w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-accent', l.id === lenderId && 'bg-accent')}
            >
              {l.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

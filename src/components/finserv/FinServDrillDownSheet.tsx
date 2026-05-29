import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ExternalLink, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';

type SortKey = 'name' | 'stage' | 'owner' | 'mrr' | 'otr' | 'updated';
type SortDir = 'asc' | 'desc';

function compactUSD(v: number) {
  if (!v) return '$0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

export interface FinServDrillDownConfig {
  title: string;
  formula: string;
  deals: Deal[];
}

interface Props {
  config: FinServDrillDownConfig | null;
  stages: DealStageOption[];
  onOpenChange: (open: boolean) => void;
  navigatePath?: (dealId: string) => string;
}

export function FinServDrillDownSheet({ config, stages, onOpenChange, navigatePath }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('mrr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const stageLabel = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach(s => m.set(s.id, s.label));
    return (id: string) => m.get(id) || id;
  }, [stages]);

  const rows = useMemo(() => {
    if (!config) return [];
    const q = search.trim().toLowerCase();
    const base = config.deals.map(d => ({
      id: d.id,
      name: d.company || d.name || 'Untitled',
      stage: d.stage,
      stageDisplay: stageLabel(d.stage),
      owner: d.dealOwner || '—',
      mrr: Number(d.mrr ?? 0),
      otr: Number(d.oneTimeRevenue ?? 0),
      updatedAt: d.updatedAt,
    }));
    const filtered = q
      ? base.filter(
          r =>
            r.name.toLowerCase().includes(q) ||
            r.owner.toLowerCase().includes(q) ||
            r.stageDisplay.toLowerCase().includes(q),
        )
      : base;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'stage': return a.stageDisplay.localeCompare(b.stageDisplay) * dir;
        case 'owner': return a.owner.localeCompare(b.owner) * dir;
        case 'mrr': return (a.mrr - b.mrr) * dir;
        case 'otr': return (a.otr - b.otr) * dir;
        case 'updated':
          return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      }
    });
  }, [config, search, sortKey, sortDir, stageLabel]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' || k === 'owner' || k === 'stage' ? 'asc' : 'desc'); }
  };

  const SortHeader = ({ k, children, align = 'left' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors',
        align === 'right' && 'justify-end w-full',
      )}
    >
      {children}
      <ArrowUpDown className={cn('h-3 w-3 opacity-60', sortKey === k && 'opacity-100 text-foreground')} />
    </button>
  );

  const open = !!config;
  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(navigatePath ? navigatePath(id) : `/finserv?deal=${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col bg-card border-border">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-2">
          <SheetTitle className="text-base font-semibold text-foreground">{config?.title}</SheetTitle>
          {config?.formula && (
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground/80">Formula: </span>
              {config.formula}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, owner, or stage…"
                className="h-8 pl-7 text-sm"
              />
            </div>
            <Badge variant="secondary" className="text-[10px]">{rows.length} {rows.length === 1 ? 'deal' : 'deals'}</Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No deals match this metric.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left"><SortHeader k="name">Deal</SortHeader></th>
                  <th className="px-3 py-2 text-left"><SortHeader k="stage">Stage</SortHeader></th>
                  <th className="px-3 py-2 text-left"><SortHeader k="owner">Owner</SortHeader></th>
                  <th className="px-3 py-2 text-right"><SortHeader k="mrr" align="right">MRR</SortHeader></th>
                  <th className="px-3 py-2 text-right"><SortHeader k="otr" align="right">One-Time</SortHeader></th>
                  <th className="px-3 py-2 text-left"><SortHeader k="updated">Updated</SortHeader></th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => goToDeal(r.id)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[14rem]">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.stageDisplay}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[8rem]">{r.owner}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compactUSD(r.mrr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compactUSD(r.otr)}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">
                      {r.updatedAt ? formatDistanceToNow(new Date(r.updatedAt), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); goToDeal(r.id); }}
                        aria-label="Open deal"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
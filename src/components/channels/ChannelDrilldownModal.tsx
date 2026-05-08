import { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatSlug } from '@/utils/dealTypeLabels';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Download, ArrowUpDown, ArrowUpRight, AlertCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AttributedDeal } from '@/hooks/useChannelPerformanceData';

export interface DrilldownContext {
  /** Human-readable title describing what was clicked */
  title: string;
  /** The deals to display */
  deals: AttributedDeal[];
}

interface ChannelDrilldownModalProps {
  context: DrilldownContext | null;
  onClose: () => void;
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

type SortField = 'company' | 'value' | 'stage' | 'channelType' | 'channelName' | 'created_at';

function DrilldownTable({ deals }: { deals: AttributedDeal[] }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    if (!search) return deals;
    const q = search.toLowerCase();
    return deals.filter(d =>
      (d.company || '').toLowerCase().includes(q) ||
      (d.channelName || '').toLowerCase().includes(q) ||
      (d.channelType || '').toLowerCase().includes(q) ||
      (d.stage || '').toLowerCase().includes(q) ||
      (d.referred_by || '').toLowerCase().includes(q)
    );
  }, [deals, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'company': cmp = (a.company || '').localeCompare(b.company || ''); break;
        case 'value': cmp = (a.value || 0) - (b.value || 0); break;
        case 'stage': cmp = (a.stage || '').localeCompare(b.stage || ''); break;
        case 'channelType': cmp = (a.channelType || '').localeCompare(b.channelType || ''); break;
        case 'channelName': cmp = (a.channelName || '').localeCompare(b.channelName || ''); break;
        case 'created_at': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const totalVolume = filtered.reduce((s, d) => s + (d.value || 0), 0);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const headers: { key: SortField; label: string; align?: string }[] = [
    { key: 'company', label: 'Deal' },
    { key: 'value', label: 'Amount', align: 'right' },
    { key: 'stage', label: 'Stage' },
    { key: 'channelName', label: 'Referral Source' },
    { key: 'channelType', label: 'Channel' },
    { key: 'created_at', label: 'Date' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs pl-7"
          />
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {filtered.length} deal{filtered.length !== 1 ? 's' : ''} · {formatCurrency(totalVolume)}
        </Badge>
      </div>

      <ScrollArea className="h-[400px] border border-border rounded-md">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`px-2 py-1.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap ${h.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => handleSort(h.key)}
                >
                  <div className={`flex items-center gap-0.5 ${h.align === 'right' ? 'justify-end' : ''}`}>
                    {h.label}
                    {sortField === h.key && <ArrowUpDown className="h-2.5 w-2.5" />}
                  </div>
                </th>
              ))}
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No deals match your search</p>
                </td>
              </tr>
            ) : sorted.map((deal) => (
              <tr key={deal.id} className="border-t border-border/30 hover:bg-accent/30">
                <td className="px-2 py-1.5 font-medium max-w-[160px] truncate">{deal.company}</td>
                <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${(deal.value || 0) === 0 ? 'text-muted-foreground' : ''}`}>
                  {deal.value ? formatCurrency(deal.value) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                    {formatSlug(deal.stage)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[120px]">{deal.channelName}</td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground whitespace-nowrap">
                    {deal.channelType === 'M&A and Investment Bankers' ? 'M&A / IB' : deal.channelType}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                  {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </td>
                <td className="px-2 py-1.5">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" asChild>
                    <a href={`/deals/${deal.id}`} title="Open deal">
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </Button>
                </td>
              </tr>
            ))}
            {sorted.length > 0 && (
              <tr className="border-t-2 border-border bg-muted/30 font-medium">
                <td className="px-2 py-1.5">Total</td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatCurrency(totalVolume)}</td>
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

export function ChannelDrilldownModal({ context, onClose }: ChannelDrilldownModalProps) {
  const isMobile = useIsMobile();
  const open = !!context;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-sm">{context?.title || 'Drill Down'}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">
            {context && <DrilldownTable deals={context.deals} />}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">{context?.title || 'Drill Down'}</DialogTitle>
        </DialogHeader>
        {context && <DrilldownTable deals={context.deals} />}
      </DialogContent>
    </Dialog>
  );
}

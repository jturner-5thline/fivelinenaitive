import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Excel-like editor for Brand Awareness metrics. One tab per widget, each
 * tab shows a grid where the X axis is the time period (months or quarters
 * for the selected year) and cells hold user-input numeric values. Values
 * are persisted to `metric_manual_inputs` keyed by (metric_key, month_key).
 */

export const BRAND_AWARENESS_METRICS: { id: string; label: string }[] = [
  { id: 'ba-website-users', label: 'Website Users' },
  { id: 'ba-seo-clicks', label: 'SEO Clicks' },
  { id: 'ba-seo-impressions', label: 'SEO Impressions' },
  { id: 'ba-linkedin-impressions', label: 'LinkedIn Impressions' },
  { id: 'ba-linkedin-interactions', label: 'LinkedIn Interactions' },
  { id: 'ba-ai-search-readiness-score', label: 'AI Search Readiness Score' },
  { id: 'ba-market-awareness-score', label: 'Market Awareness Score' },
];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const QUARTER_LABELS = ['Q1','Q2','Q3','Q4'];

type Granularity = 'monthly' | 'quarterly';

function periodKeys(year: number, gran: Granularity): { key: string; label: string }[] {
  if (gran === 'monthly') {
    return MONTH_LABELS.map((m, i) => ({
      key: `${year}-${String(i + 1).padStart(2, '0')}`,
      label: m,
    }));
  }
  return QUARTER_LABELS.map((q, i) => ({ key: `${year}-${q}`, label: q }));
}

interface Row {
  metric_key: string;
  month_key: string;
  value: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BrandAwarenessDataEditor({ open, onClose }: Props) {
  const [activeMetric, setActiveMetric] = useState(BRAND_AWARENESS_METRICS[0].id);
  const [gran, setGran] = useState<Granularity>('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const qc = useQueryClient();

  const metricKeys = BRAND_AWARENESS_METRICS.map(m => m.id);

  const { data: rows = [] } = useQuery({
    queryKey: ['brand-awareness-inputs', metricKeys],
    enabled: open,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase.from('metric_manual_inputs') as any)
        .select('metric_key, month_key, value')
        .in('metric_key', metricKeys);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.value !== null && r.value !== undefined) {
        m.set(`${r.metric_key}::${r.month_key}`, Number(r.value));
      }
    }
    return m;
  }, [rows]);

  const upsert = useMutation({
    mutationFn: async (input: { metric_key: string; month_key: string; value: number | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');
      const { error } = await (supabase.from('metric_manual_inputs') as any)
        .upsert(
          {
            user_id: userData.user.id,
            company_id: null,
            metric_key: input.metric_key,
            month_key: input.month_key,
            value: input.value,
          },
          { onConflict: 'company_id,metric_key,month_key' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-awareness-inputs'] });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const periods = periodKeys(year, gran);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[1100px] w-[95vw] h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle>Brand Awareness · Data Entry</DialogTitle>
          <DialogDescription>
            Enter values per period for each brand awareness metric. Saves automatically on change.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeMetric} onValueChange={setActiveMetric} className="flex-1 flex flex-col min-h-0">
          <div className="border-b border-border/60 px-3 shrink-0 overflow-x-auto">
            <TabsList className="h-auto p-1 bg-transparent gap-1">
              {BRAND_AWARENESS_METRICS.map(m => (
                <TabsTrigger
                  key={m.id}
                  value={m.id}
                  className="text-xs data-[state=active]:bg-muted rounded-sm px-3 py-1.5"
                >
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setYear(y => y - 1)} className="h-7 w-7 p-0">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="text-sm font-semibold tabular-nums min-w-[3.5rem] text-center">{year}</div>
              <Button size="sm" variant="outline" onClick={() => setYear(y => y + 1)} className="h-7 w-7 p-0">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
              {(['monthly','quarterly'] as Granularity[]).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGran(g)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-sm capitalize',
                    gran === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {BRAND_AWARENESS_METRICS.map(m => (
            <TabsContent key={m.id} value={m.id} className="flex-1 min-h-0 overflow-auto m-0 p-6">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] uppercase tracking-wide text-muted-foreground/70 pb-2 pr-3 sticky left-0 bg-background">
                      Metric
                    </th>
                    {periods.map(p => (
                      <th key={p.key} className="text-[11px] uppercase tracking-wide text-muted-foreground/70 pb-2 px-2 text-center">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-3 py-1 font-medium text-foreground sticky left-0 bg-background whitespace-nowrap">
                      {m.label}
                    </td>
                    {periods.map(p => (
                      <PeriodCell
                        key={p.key}
                        initial={valueMap.get(`${m.id}::${p.key}`)}
                        onCommit={(v) => upsert.mutate({ metric_key: m.id, month_key: p.key, value: v })}
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PeriodCell({ initial, onCommit }: { initial?: number; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(initial === undefined ? '' : String(initial));
  useEffect(() => {
    setText(initial === undefined ? '' : String(initial));
  }, [initial]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      if (initial !== undefined) onCommit(null);
      return;
    }
    const n = Number(trimmed.replace(/,/g, ''));
    if (!Number.isFinite(n)) return;
    if (n !== initial) onCommit(n);
  };

  return (
    <td className="px-1 py-0.5">
      <Input
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
        }}
        inputMode="decimal"
        className="h-8 text-right tabular-nums text-sm px-2"
      />
    </td>
  );
}
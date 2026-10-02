import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;
const EXCLUDED = (name: string | null | undefined) => {
  const n = (name ?? '').trim().toLowerCase();
  return n === "test-niki's store" || n === 'example deal' || n.startsWith('test ');
};

type Tone = 'green' | 'orange' | 'red';
export function velocityTone(days: number, avg: number): Tone {
  if (days < avg) return 'green';
  if (days <= avg * 1.15) return 'orange';
  return 'red';
}
export const toneClass: Record<Tone, string> = {
  green: 'bg-emerald-500/10 text-emerald-300',
  orange: 'bg-amber-500/15 text-amber-300',
  red: 'bg-rose-500/15 text-rose-300',
};

const fmtDays = (d: number) => (d < 28 ? `${Math.round(d)}d` : `${Math.floor(d / 7)}w`);
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

interface StageRow {
  key: string;
  label: string;
  avg: number;
  median: number;
  samples: number;
  deals: { id: string; company: string; days: number }[];
}

export function useVelocity() {
  return useQuery({
    queryKey: ['pipeline-velocity'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StageRow[]> => {
      const { data: pipes } = await supabase.from('deal_pipelines').select('id').eq('is_default', true);
      const pipeIds = new Set((pipes ?? []).map((p: any) => p.id));
      const since12m = new Date(Date.now() - 365 * DAY).toISOString();

      // Benchmarks: trailing 12 months, ALL deals across every pipeline.
      const hist: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('deal_stage_history')
          .select('deal_id,to_stage,to_stage_id,to_stage_label_raw,changed_at,exited_at')
          .not('exited_at', 'is', null)
          .gte('exited_at', since12m)
          .range(from, from + 999);
        if (error) throw error;
        hist.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }

      const allDeals: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any)
          .from('deals')
          .select('id,company,stage,stage_entered_at,created_at,status,pipeline_id')
          .range(from, from + 999);
        if (error) throw error;
        allDeals.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const dealNames = new Map<string, string>(allDeals.map((d: any) => [d.id, d.company]));
      // Open deals listed in the widget remain the Active Pipeline.
      const deals = allDeals.filter((d: any) => pipeIds.has(d.pipeline_id) && d.status !== 'archived');

      const buckets = new Map<string, { label: string; durs: number[] }>();
      for (const h of hist) {
        const dur = (new Date(h.exited_at).getTime() - new Date(h.changed_at).getTime()) / DAY;
        if (!(dur > 0)) continue;
        if (dealNames.has(h.deal_id) && EXCLUDED(dealNames.get(h.deal_id))) continue;
        const label = h.to_stage_label_raw || h.to_stage || '';
        const key = norm(h.to_stage_id || h.to_stage || label);
        if (!key || key.startsWith('closed')) continue;
        const b = buckets.get(key) ?? { label, durs: [] };
        if (h.to_stage_label_raw) b.label = h.to_stage_label_raw;
        b.durs.push(dur);
        buckets.set(key, b);
      }

      const rows = new Map<string, StageRow>();
      for (const [key, b] of buckets) {
        if (b.durs.length < 3) continue;
        const s = [...b.durs].sort((a, c) => a - c);
        const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
        rows.set(key, {
          key, label: b.label, samples: s.length, median,
          avg: s.reduce((a, c) => a + c, 0) / s.length, deals: [],
        });
      }

      const now = Date.now();
      for (const d of deals ?? []) {
        if (EXCLUDED(d.company)) continue;
        const row = rows.get(norm(d.stage ?? ''));
        if (!row) continue;
        const since = new Date(d.stage_entered_at ?? d.created_at).getTime();
        row.deals.push({ id: d.id, company: d.company, days: Math.max(0, (now - since) / DAY) });
      }
      return [...rows.values()]
        .map(r => ({ ...r, deals: r.deals.sort((a, c) => c.days - a.days) }))
        .sort((a, c) => c.deals.length - a.deals.length || c.samples - a.samples);
    },
  });
}

export function PipelineVelocityWidget({ onOpenDeal }: { onOpenDeal?: (id: string) => void }) {
  const { data, isLoading, error } = useVelocity();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const totals = useMemo(() => {
    const t = { green: 0, orange: 0, red: 0 };
    (data ?? []).forEach(r => r.deals.forEach(d => t[velocityTone(d.days, r.avg)]++));
    return t;
  }, [data]);

  return (
    <Card className="glass-module">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold">Pipeline Velocity</CardTitle>
          <div className="flex gap-2 text-[11px] font-mono">
            <span className={cn('px-2 py-0.5 rounded', toneClass.green)}>Under avg · {totals.green}</span>
            <span className={cn('px-2 py-0.5 rounded', toneClass.orange)}>Avg to +15% · {totals.orange}</span>
            <span className={cn('px-2 py-0.5 rounded', toneClass.red)}>&gt;15% over · {totals.red}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Average time per stage (completed stage stays, trailing 12 months, all deals) vs. current time in stage for open deals.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="text-sm text-muted-foreground py-4">Couldn't load stage history.</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-4">Not enough stage history yet.</p>
        ) : (
          <div className="text-sm">
            <div className="grid grid-cols-[1fr_80px_80px_70px_90px] gap-2 px-2 pb-2 text-[11px] text-muted-foreground uppercase tracking-wide">
              <span>Stage</span><span className="text-right">Avg</span><span className="text-right">Median</span>
              <span className="text-right">Open</span><span className="text-right">Open avg</span>
            </div>
            {data.map(r => {
              const curAvg = r.deals.length ? r.deals.reduce((a, d) => a + d.days, 0) / r.deals.length : null;
              const isOpen = !!open[r.key];
              return (
                <div key={r.key} className="border-t border-border/30">
                  <button
                    type="button"
                    disabled={!r.deals.length}
                    onClick={() => setOpen(o => ({ ...o, [r.key]: !o[r.key] }))}
                    className="w-full grid grid-cols-[1fr_80px_80px_70px_90px] gap-2 items-center px-2 py-2 text-left hover:bg-muted/20 disabled:hover:bg-transparent"
                  >
                    <span className="flex items-center gap-1 truncate">
                      {r.deals.length ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="w-3" />}
                      {r.label}
                    </span>
                    <span className="text-right font-mono tabular-nums">{r.avg.toFixed(1)}d</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">{r.median.toFixed(1)}d</span>
                    <span className="text-right font-mono tabular-nums">{r.deals.length}</span>
                    <span className="text-right">
                      {curAvg == null ? <span className="text-muted-foreground">—</span> : (
                        <span className={cn('px-2 py-0.5 rounded font-mono tabular-nums', toneClass[velocityTone(curAvg, r.avg)])}>
                          {fmtDays(curAvg)}
                        </span>
                      )}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-wrap gap-1.5 px-6 pb-3">
                      {r.deals.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => onOpenDeal?.(d.id)}
                          className={cn('px-2 py-1 rounded text-xs', toneClass[velocityTone(d.days, r.avg)])}
                          title={`${d.days.toFixed(1)} days vs ${r.avg.toFixed(1)}-day average`}
                        >
                          {d.company} · <span className="font-mono">{fmtDays(d.days)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

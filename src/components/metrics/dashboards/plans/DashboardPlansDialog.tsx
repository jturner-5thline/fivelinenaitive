import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  buildPlanMetricKey,
  getPlannableWidgets,
  type PlannableDashboardKey,
  type PlanWidgetFormat,
} from './plannableWidgetsRegistry';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardKey: PlannableDashboardKey;
}

type Mode = 'monthly' | 'quarterly';

function pad(n: number) { return String(n).padStart(2, '0'); }

function monthPeriodKeys(year: number): { key: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1);
    return {
      key: `${year}-${pad(i + 1)}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  });
}

function quarterPeriodKeys(year: number): { key: string; label: string }[] {
  return [1, 2, 3, 4].map((q) => ({ key: `${year}-Q${q}`, label: `Q${q}` }));
}

function formatDisplay(raw: string, format: PlanWidgetFormat): string {
  return raw;
}

function parseInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Allow "1.2M", "500k", commas, $
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  const suffix = cleaned.slice(-1).toLowerCase();
  let mult = 1;
  let body = cleaned;
  if (suffix === 'k') { mult = 1_000; body = cleaned.slice(0, -1); }
  else if (suffix === 'm') { mult = 1_000_000; body = cleaned.slice(0, -1); }
  else if (suffix === 'b') { mult = 1_000_000_000; body = cleaned.slice(0, -1); }
  const n = Number(body);
  if (!Number.isFinite(n)) return NaN as any;
  return n * mult;
}

/**
 * Excel-style plans/targets editor for a dashboard.
 * Rows = widgets, columns = periods (12 months or 4 quarters).
 */
export function DashboardPlansDialog({ open, onOpenChange, dashboardKey }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const reg = getPlannableWidgets(dashboardKey);
  const [mode, setMode] = useState<Mode>('monthly');
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const periods = useMemo(
    () => (mode === 'monthly' ? monthPeriodKeys(year) : quarterPeriodKeys(year)),
    [mode, year],
  );

  // Load existing targets whenever dialog opens or scope changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const metricKeys = reg.widgets.map((w) => buildPlanMetricKey(dashboardKey, w.key));
        const periodKeys = periods.map((p) => p.key);
        let q = supabase
          .from('insights_metric_targets' as any)
          .select('metric_key, period_month, target_value')
          .in('metric_key', metricKeys)
          .in('period_month', periodKeys);
        q = company?.id ? q.eq('company_id', company.id) : q.is('company_id', null);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const row of (data ?? []) as any[]) {
          next[`${row.metric_key}|${row.period_month}`] = String(row.target_value ?? '');
        }
        setValues(next);
      } catch (e: any) {
        toast.error('Failed to load plans', { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dashboardKey, mode, year, company?.id]);

  async function handleSave() {
    if (!user) { toast.error('Not signed in'); return; }
    setSaving(true);
    try {
      const upserts: any[] = [];
      const deletes: { metric_key: string; period_month: string }[] = [];
      for (const w of reg.widgets) {
        const mk = buildPlanMetricKey(dashboardKey, w.key);
        for (const p of periods) {
          const raw = values[`${mk}|${p.key}`] ?? '';
          if (raw.trim() === '') {
            deletes.push({ metric_key: mk, period_month: p.key });
            continue;
          }
          const num = parseInput(raw);
          if (!Number.isFinite(num as number)) {
            throw new Error(`Invalid number "${raw}" for ${w.label} ${p.label}`);
          }
          upserts.push({
            owner_user_id: user.id,
            company_id: company?.id ?? null,
            metric_key: mk,
            metric_label: `${reg.label} · ${w.label}`,
            period_month: p.key,
            target_value: num,
          });
        }
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('insights_metric_targets' as any)
          .upsert(upserts, { onConflict: 'company_id,metric_key,period_month' });
        if (error) throw error;
      }
      for (const d of deletes) {
        let del = supabase
          .from('insights_metric_targets' as any)
          .delete()
          .eq('metric_key', d.metric_key)
          .eq('period_month', d.period_month);
        del = company?.id ? del.eq('company_id', company.id) : del.is('company_id', null);
        await del;
      }
      queryClient.invalidateQueries({ queryKey: ['insights-metric-targets'] });
      toast.success('Plans saved');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Save failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Edit Plans — {reg.label}</DialogTitle>
          <DialogDescription>
            Enter monthly or quarterly plan/target values for each widget. Leave blank to clear.
            You can use shorthand like <span className="font-mono">1.2M</span>,{' '}
            <span className="font-mono">500k</span>, or plain numbers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly (12)</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly (4)</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-16 text-center font-medium tabular-nums">{year}</div>
            <Button variant="ghost" size="icon" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto border border-border rounded-md">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground sticky left-0 bg-card min-w-56">
                    Widget
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p.key}
                      className="text-right px-2 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground min-w-24"
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reg.widgets.map((w) => {
                  const mk = buildPlanMetricKey(dashboardKey, w.key);
                  return (
                    <tr key={w.key} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-1.5 sticky left-0 bg-card">
                        <div className="font-medium text-foreground/90">{w.label}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {w.format === 'currency' ? '$' : w.format === 'percent' ? '%' : '#'}
                          {w.hint ? ` · ${w.hint}` : ''}
                        </div>
                      </td>
                      {periods.map((p) => {
                        const k = `${mk}|${p.key}`;
                        return (
                          <td key={p.key} className="px-1 py-1">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={formatDisplay(values[k] ?? '', w.format)}
                              onChange={(e) =>
                                setValues((v) => ({ ...v, [k]: e.target.value }))
                              }
                              className="h-8 text-right tabular-nums px-2"
                              placeholder="—"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
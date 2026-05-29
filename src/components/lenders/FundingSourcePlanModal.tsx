import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Target, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type Cadence = 'monthly' | 'quarterly';

const MODAL_SHELL_STYLE: CSSProperties = {
  background:
    'radial-gradient(120% 80% at 0% 0%, hsl(220 55% 22% / 0.55) 0%, transparent 55%),' +
    'radial-gradient(120% 80% at 100% 100%, hsl(220 60% 14% / 0.55) 0%, transparent 60%),' +
    'linear-gradient(180deg, hsl(220 40% 11% / 0.96) 0%, hsl(220 45% 7% / 0.98) 100%)',
  borderColor: 'hsl(220 50% 40% / 0.28)',
  boxShadow:
    'inset 0 1px 0 hsl(220 60% 85% / 0.06), 0 24px 60px hsl(220 60% 3% / 0.6)',
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface PlanRow {
  period: number;
  target_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1];

export function useAcquisitionPlan(
  tenantId: string | null,
  year: number,
  cadence: Cadence,
) {
  return useQuery({
    queryKey: ['funding-source-acquisition-plan', tenantId, year, cadence],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<PlanRow[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('funding_source_acquisition_plans')
        .select('period, target_count')
        .eq('tenant_id', tenantId)
        .eq('year', year)
        .eq('cadence', cadence);
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });
}

export function FundingSourcePlanModal({ open, onOpenChange, tenantId }: Props) {
  const queryClient = useQueryClient();
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [year, setYear] = useState<number>(currentYear);
  const [values, setValues] = useState<Record<number, string>>({});
  const [bulk, setBulk] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const periodCount = cadence === 'monthly' ? 12 : 4;

  const { data: existing, isLoading } = useAcquisitionPlan(tenantId, year, cadence);

  // Pre-fill inputs whenever data, cadence, or year changes
  useEffect(() => {
    if (!open) return;
    const next: Record<number, string> = {};
    for (let p = 1; p <= periodCount; p++) next[p] = '';
    for (const row of existing ?? []) {
      if (row.period >= 1 && row.period <= periodCount) {
        next[row.period] = String(row.target_count);
      }
    }
    setValues(next);
  }, [existing, periodCount, open, cadence, year]);

  const total = useMemo(
    () => Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0),
    [values],
  );

  const invalid = useMemo(() => {
    for (const v of Object.values(values)) {
      if (v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return true;
    }
    return false;
  }, [values]);

  const handleBulkFill = () => {
    const n = Number(bulk);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      toast.error('Bulk value must be a non-negative whole number');
      return;
    }
    const next: Record<number, string> = {};
    for (let p = 1; p <= periodCount; p++) next[p] = String(n);
    setValues(next);
  };

  const handleSave = async () => {
    if (invalid) {
      toast.error('All targets must be non-negative whole numbers');
      return;
    }
    if (total === 0) {
      const ok = window.confirm(
        'Total target is 0 across all periods. Save anyway?',
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      const rows = Array.from({ length: periodCount }, (_, i) => {
        const period = i + 1;
        return {
          tenant_id: tenantId,
          year,
          cadence,
          period,
          target_count: Math.max(0, Math.floor(Number(values[period] || 0))),
          updated_by: userId,
        };
      });
      const { error } = await supabase
        .from('funding_source_acquisition_plans')
        .upsert(rows, { onConflict: 'tenant_id,year,cadence,period' });
      if (error) throw error;
      toast.success('Acquisition plan saved');
      queryClient.invalidateQueries({
        queryKey: ['funding-source-acquisition-plan', tenantId],
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to save plan: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent
        className="max-w-2xl w-[95vw] p-0 overflow-hidden border text-slate-100"
        style={MODAL_SHELL_STYLE}
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-700/40">
          <DialogTitle className="flex items-center gap-2 text-slate-100 text-[15px]">
            <Target className="h-4 w-4 text-sky-400" />
            Funding Source Acquisition Plan
          </DialogTitle>
          <DialogDescription className="text-[12px] text-slate-400">
            Set targets for adding new qualified lenders. Visible to your tenant only.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
              <TabsList className="bg-slate-900/60 border border-slate-700/60">
                <TabsTrigger value="monthly" className="text-[12px]">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly" className="text-[12px]">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[120px] text-[12px] bg-slate-900/60 border-slate-700/60 text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[1500]">
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder="Bulk fill"
                className="h-8 w-[110px] text-[12px] bg-slate-900/60 border-slate-700/60 text-slate-100"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBulkFill}
                className="h-8 text-[12px] bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70"
              >
                Apply to all
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-[12px]">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading plan…
            </div>
          ) : (
            <div
              className={
                cadence === 'monthly'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'
                  : 'grid grid-cols-2 sm:grid-cols-4 gap-3'
              }
            >
              {Array.from({ length: periodCount }, (_, i) => {
                const period = i + 1;
                const label =
                  cadence === 'monthly'
                    ? `${MONTH_LABELS[i]} ${year}`
                    : `Q${period} ${year}`;
                return (
                  <div key={period} className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wider text-slate-400">
                      {label}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={values[period] ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [period]: e.target.value }))
                      }
                      placeholder="0"
                      className="h-9 bg-slate-900/60 border-slate-700/60 text-slate-100 text-[13px]"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between text-[12px] text-slate-400 pt-2 border-t border-slate-700/40">
            <span>
              Total target {year} ({cadence}):{' '}
              <span className="text-slate-100 font-semibold tabular-nums">{total}</span>
            </span>
            {!isLoading && total === 0 && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Total is 0
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-700/40 bg-slate-950/40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || invalid}
            className="h-8"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
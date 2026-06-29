import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface MetricManualInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricKey: string;
  title: string;
  unitLabel?: string;
  /** Array of month bucket keys in YYYY-MM order */
  monthKeys: string[];
  /** Human-readable label for each month key, parallel to monthKeys */
  monthLabels: string[];
  /** Optional callback fired after a successful save so consumers can refresh derived calcs */
  onSaved?: () => void;
}

/**
 * Excel-style monthly value input grid persisted in metric_manual_inputs.
 * Generic — feeds future calculated metrics by (metricKey, month_key).
 */
export function MetricManualInputDialog({
  open,
  onOpenChange,
  metricKey,
  title,
  unitLabel = 'Value',
  monthKeys,
  monthLabels,
  onSaved,
}: MetricManualInputDialogProps) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const companyId = company?.id ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('metric_manual_inputs')
          .select('month_key, value')
          .eq('metric_key', metricKey)
          .in('month_key', monthKeys);
        q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          next[row.month_key as string] = row.value == null ? '' : String(row.value);
        }
        setValues(next);
      } catch (e: any) {
        toast.error('Failed to load inputs', { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, metricKey, companyId, monthKeys.join('|')]);

  const dirtyRows = useMemo(() => {
    return monthKeys.map((k, i) => ({
      month_key: k,
      label: monthLabels[i] ?? k,
      raw: values[k] ?? '',
    }));
  }, [monthKeys, monthLabels, values]);

  async function handleSave() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error('Not signed in'); return; }
    setSaving(true);
    try {
      const payload = dirtyRows
        .map((r) => {
          const trimmed = r.raw.trim();
          const num = trimmed === '' ? null : Number(trimmed);
          if (trimmed !== '' && Number.isNaN(num)) {
            throw new Error(`Invalid number for ${r.label}`);
          }
          return {
            company_id: companyId,
            user_id: uid,
            metric_key: metricKey,
            month_key: r.month_key,
            value: num,
          };
        });
      const { error } = await supabase
        .from('metric_manual_inputs')
        .upsert(payload, { onConflict: 'company_id,metric_key,month_key' });
      if (error) throw error;
      toast.success('Inputs saved');
      // Refresh any widget consuming this metric so calculations update in real time.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          if (typeof k !== 'string') return false;
          return (
            k === 'rev-per-hour-hours' ||
            k === `metric-manual:${metricKey}` ||
            k.startsWith('metric-manual:')
          );
        },
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Save failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Enter monthly values. Leave blank to clear.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto border border-border rounded-md">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">Month</th>
                  <th className="text-right px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">{unitLabel}</th>
                </tr>
              </thead>
              <tbody>
                {dirtyRows.map((r) => (
                  <tr key={r.month_key} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 text-foreground/90">{r.label}</td>
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={r.raw}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [r.month_key]: e.target.value }))
                        }
                        className="h-8 text-right tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
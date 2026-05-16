import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KpiMetricKey, KpiPlanRow } from '@/hooks/useDashboardKpiYtd';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: KpiPlanRow | undefined;
  metricKey: KpiMetricKey;
  label: string;
  formatType: 'number' | 'currency';
  onSaved: () => void;
}

/** Convert stored numeric plan into an editor-friendly string. */
function toInput(value: number, formatType: 'number' | 'currency'): string {
  if (formatType === 'currency') {
    // Show in millions for editor friendliness.
    return (value / 1_000_000).toString();
  }
  return String(value);
}

/** Convert editor string back into the stored numeric value. */
function fromInput(raw: string, formatType: 'number' | 'currency'): number | null {
  const n = Number(raw.replace(/[, $]/g, ''));
  if (!Number.isFinite(n)) return null;
  return formatType === 'currency' ? n * 1_000_000 : n;
}

export function KpiPlanEditDialog({
  open,
  onOpenChange,
  plan,
  metricKey,
  label,
  formatType,
  onSaved,
}: Props) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(plan ? toInput(Number(plan.plan_value), formatType) : '');
    }
  }, [open, plan, formatType]);

  const handleSave = async () => {
    const numeric = fromInput(value, formatType);
    if (numeric === null) {
      toast.error('Enter a valid number');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('dashboard_kpi_plans' as any)
        .upsert(
          {
            metric_key: metricKey,
            label,
            plan_value: numeric,
            format_type: formatType,
            comparison_mode: 'plan',
            updated_at: new Date().toISOString(),
            updated_by: user?.id ?? null,
          } as any,
          { onConflict: 'metric_key' },
        );
      if (error) throw error;
      toast.success(`${label} plan updated`);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {label} Plan</DialogTitle>
          <DialogDescription>
            Set the YTD plan/target. Actuals stay live; only the plan figure
            and "% of Plan" comparison change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="kpi-plan-value">
            Plan target {formatType === 'currency' ? '(in $MM)' : ''}
          </Label>
          <Input
            id="kpi-plan-value"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={formatType === 'currency' ? 'e.g. 117.75' : 'e.g. 16'}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
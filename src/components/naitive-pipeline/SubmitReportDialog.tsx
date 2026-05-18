import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Deal } from '@/types/deal';
import type { NaitivePipelineFilterState } from '@/hooks/useNaitivePipelineFilters';

const RECIPIENTS = [
  'ppina@5thline.co',
  'jturner@5thline.co',
  'ffustinoni@5thline.co',
  'jmoffitt@5thline.co',
];

const FIFTH_LINE_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';

function startOfWeek(d: Date) {
  const n = new Date(d);
  const dow = n.getDay(); // 0 Sun..6 Sat
  const offset = dow === 0 ? -6 : 1 - dow; // Monday start
  n.setDate(n.getDate() + offset);
  n.setHours(0, 0, 0, 0);
  return n;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function compactDeal(d: Deal) {
  return {
    id: d.id,
    name: d.company || d.name,
    stage: d.stage,
    status: d.status,
    manager: d.dealOwner || d.manager,
    value: d.value,
    closingDate: d.closingDate || null,
    icpCategory: (d as any).icpCategory || null,
    sourcedVia: d.sourcedVia || (d as any).leadSource || (d as any).referralSource || null,
    updatedAt: d.updatedAt,
    onHold: d.onHold,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: NaitivePipelineFilterState;
  activeCount: number;
  filteredDeals: Deal[];
  totalDeals: number;
  stageLabels: Record<string, string>;
}

export function SubmitReportDialog({
  open,
  onOpenChange,
  filters,
  activeCount,
  filteredDeals,
  totalDeals,
  stageLabels,
}: Props) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const period = useMemo(() => {
    const now = new Date();
    const s = startOfWeek(now);
    const e = endOfWeek(now);
    const key = `${s.getFullYear()}-W${Math.ceil(((s.getTime() - new Date(s.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(s.getFullYear(), 0, 1).getDay() + 1) / 7)}`;
    return {
      type: 'week' as const,
      key,
      label: `Week of ${fmtDate(s)} – ${fmtDate(e)}`,
      start: s.toISOString(),
      end: e.toISOString(),
    };
  }, [open]);

  // Stage counts for snapshot
  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of filteredDeals) {
      map.set(d.stage, (map.get(d.stage) || 0) + 1);
    }
    return Array.from(map.entries()).map(([stage, count]) => ({
      stage,
      label: stageLabels[stage] || stage,
      count,
    }));
  }, [filteredDeals, stageLabels]);

  const totalValue = useMemo(
    () => filteredDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
    [filteredDeals],
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Fetch current week's narrative if any
      let narrativeContent = '';
      try {
        const { data: narrativeRow } = await supabase
          .from('naitive_pipeline_narratives' as any)
          .select('content')
          .eq('company_id', FIFTH_LINE_COMPANY_ID)
          .eq('period_type', 'week')
          .eq('period_key', period.key)
          .maybeSingle();
        narrativeContent = (narrativeRow as any)?.content || '';
      } catch {
        // ignore — narrative is optional
      }

      const snapshot = {
        version: 1,
        period,
        metrics: {
          totalDeals,
          filteredCount: filteredDeals.length,
          totalValue,
        },
        stageCounts,
        deals: filteredDeals.map(compactDeal),
        narrative: narrativeContent,
        stageLabels,
      };

      const { data, error } = await supabase.functions.invoke(
        'submit-naitive-pipeline-report',
        {
          body: {
            filters,
            period_type: period.type,
            period_key: period.key,
            period_label: period.label,
            snapshot,
          },
        },
      );

      if (error) throw error;
      const result = data as { id: string; url: string; email_sent: boolean; email_error: string | null };

      if (result?.email_sent) {
        toast.success('Report submitted and emailed to recipients');
      } else {
        toast.success('Report saved', {
          description: result?.email_error ? `Email failed: ${result.email_error}` : 'Email delivery is pending',
        });
      }
      onOpenChange(false);
      navigate(`/naitive-pipeline/reports/${result.id}`);
    } catch (e: any) {
      console.error('[submit-report] error', e);
      toast.error('Failed to submit report', { description: e?.message || String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Submit naitive Pipeline Report
          </DialogTitle>
          <DialogDescription>
            A snapshot of the current report will be saved and emailed to the recipients below.
            The snapshot is frozen — later filter or data changes will not modify it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reporting period</span>
              <span className="font-medium">{period.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deals included</span>
              <span className="font-medium">
                {filteredDeals.length} of {totalDeals}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active filters</span>
              <span className="font-medium">{activeCount === 0 ? 'None' : activeCount}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Recipients</div>
            <ul className="text-sm space-y-0.5">
              {RECIPIENTS.map((r) => (
                <li key={r} className="text-foreground/90">{r}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              The email's "View Report" button links to the saved snapshot, not the live dashboard.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirm & Submit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
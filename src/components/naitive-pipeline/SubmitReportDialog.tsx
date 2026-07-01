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
import { Loader2, Send, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Deal } from '@/types/deal';
import type { NaitivePipelineFilterState } from '@/hooks/useNaitivePipelineFilters';
import {
  isValidRecipientEmail,
  splitRecipientList,
  extractEmailFromRecipientToken,
} from '@/lib/emailRecipients';

// Default "to" recipients for the 5th Line pipeline report. Always included
// and non-removable; users can add additional recipients on top of these.
const DEFAULT_RECIPIENTS = [
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
  'swilliams@5thline.co',
  'mclark@5thline.co',
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
  const [extraRecipients, setExtraRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');

  const addRecipientsFromInput = (raw: string) => {
    const tokens = splitRecipientList(raw);
    if (tokens.length === 0) return;
    const existing = new Set(
      [...DEFAULT_RECIPIENTS, ...extraRecipients].map((e) => e.toLowerCase()),
    );
    const added: string[] = [];
    const invalid: string[] = [];
    for (const token of tokens) {
      const { email } = extractEmailFromRecipientToken(token);
      const clean = email.trim().toLowerCase();
      if (!clean) continue;
      if (!isValidRecipientEmail(clean)) {
        invalid.push(token);
        continue;
      }
      if (existing.has(clean)) continue;
      existing.add(clean);
      added.push(clean);
    }
    if (added.length) setExtraRecipients((prev) => [...prev, ...added]);
    if (invalid.length) {
      toast.error(`Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`);
    }
    setRecipientInput('');
  };

  const removeExtraRecipient = (email: string) => {
    setExtraRecipients((prev) => prev.filter((e) => e !== email));
  };

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
            recipients: [...DEFAULT_RECIPIENTS, ...extraRecipients],
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

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Recipients</div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_RECIPIENTS.map((r) => (
                <Badge
                  key={r}
                  variant="secondary"
                  className="text-xs font-normal py-1 px-2"
                  title="Default recipient"
                >
                  {r}
                </Badge>
              ))}
              {extraRecipients.map((r) => (
                <Badge
                  key={r}
                  variant="outline"
                  className="text-xs font-normal py-1 pl-2 pr-1 gap-1 items-center"
                >
                  {r}
                  <button
                    type="button"
                    onClick={() => removeExtraRecipient(r)}
                    className="rounded hover:bg-muted p-0.5"
                    aria-label={`Remove ${r}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
                  if (recipientInput.trim()) {
                    e.preventDefault();
                    addRecipientsFromInput(recipientInput);
                  }
                }
              }}
              onBlur={() => {
                if (recipientInput.trim()) addRecipientsFromInput(recipientInput);
              }}
              placeholder="Add more emails (comma or Enter to add)"
              className="h-8 text-sm"
            />
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
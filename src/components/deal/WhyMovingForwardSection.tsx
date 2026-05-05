import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Plus, Trash2, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { useAdvanceReasons } from '@/hooks/useAdvanceReasons';
import {
  ADVANCE_REASON_LABELS,
  AdvanceReasonCategory,
} from '@/types/deal';

const CATEGORIES = Object.keys(ADVANCE_REASON_LABELS) as AdvanceReasonCategory[];

interface Props {
  dealId: string;
  /** When true, render compact (used inline next to the blocker section). */
  compact?: boolean;
}

/**
 * "Why Moving Forward" — symmetrical to the existing "Why Not Moving Forward"
 * blocker capture. Logs an advance reason (category + optional notes) for
 * the deal. Reasons are persisted to `deal_advance_reasons` and surfaced on
 * the naitive Pipeline Weekly Execution Pulse card.
 */
export function WhyMovingForwardSection({ dealId, compact }: Props) {
  const { reasons, isLoading, addReason, deleteReason } = useAdvanceReasons(dealId);
  const [category, setCategory] = useState<AdvanceReasonCategory | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!category) return;
    setSubmitting(true);
    const created = await addReason({ category, notes });
    setSubmitting(false);
    if (created) {
      setCategory('');
      setNotes('');
    }
  };

  return (
    <section className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground">Why Moving Forward</h3>
      </div>

      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Accelerator</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as AdvanceReasonCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Pick an accelerator…" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ADVANCE_REASON_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!category || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Log</span>
          </Button>
        </div>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context — what specifically moved this forward?"
          className="text-sm"
        />
      </div>

      <div className="space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : reasons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No accelerators logged yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {reasons.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">
                    {ADVANCE_REASON_LABELS[r.category]}
                  </p>
                  {r.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{r.notes}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                    {format(new Date(r.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteReason(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
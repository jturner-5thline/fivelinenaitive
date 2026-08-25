import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useFinservMrrComponents } from '@/hooks/useFinservMrrComponents';
import { useDebouncedFieldValue, flushOnEnterOrTab } from '@/hooks/useDebouncedFieldValue';

const fmtUSD = (n: number) =>
  (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Read-only MRR display + "Update" button. Clicking the button opens a
 * confirmation dialog where the user enters the new MRR amount. This
 * prevents accidental edits and ensures every change is intentional
 * (feeding the Expansion/Contraction activity log).
 */
function ManualMrrDisplay({
  value,
  onCommit,
}: {
  value: number | null | undefined;
  onCommit: (next: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const current = value == null || Number.isNaN(value) ? null : Math.round(value);

  useEffect(() => {
    if (open) setDraft(current == null ? '' : String(current));
  }, [open, current]);

  const cleaned = draft.replace(/[$,\s]/g, '');
  const parsed = cleaned === '' ? null : Number(cleaned);
  const valid = cleaned === '' || /^\d+(\.\d{0,2})?$/.test(cleaned);
  const changed = parsed !== current;

  const save = () => {
    if (!valid || !changed) { setOpen(false); return; }
    onCommit(parsed);
    setOpen(false);
  };

  return (
    <>
      <div className="flex w-full min-w-0 flex-col gap-1.5">
        <div className="flex h-8 w-full min-w-0 items-center rounded-md border border-input bg-muted/40 px-2 text-sm text-foreground">
          <span className="tabular-nums truncate">
            {current == null ? <span className="text-muted-foreground">Not set</span> : fmtUSD(current)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full px-2.5 text-xs"
          onClick={() => setOpen(true)}
        >
          <Pencil className="h-3 w-3 mr-1" />
          Update MRR
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update MRR</DialogTitle>
            <DialogDescription>
              Enter the new monthly recurring revenue amount. The change will be logged
              as an Expansion or Contraction in the deal's activity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Current: <span className="tabular-nums text-foreground">{current == null ? '—' : fmtUSD(current)}</span>
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => {
                  const v = e.target.value.replace(/[$,\s]/g, '');
                  if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) setDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); save(); }
                }}
                placeholder="0"
                className="pl-5 h-9 text-sm w-full"
              />
            </div>
            {valid && changed && parsed != null && current != null && (
              <div className={`text-xs ${parsed > current ? 'text-emerald-400' : 'text-rose-400'}`}>
                {parsed > current ? 'Expansion' : 'Contraction'} of {fmtUSD(Math.abs(parsed - current))}
                {current > 0 && (
                  <> ({parsed > current ? '+' : ''}{(((parsed - current) / current) * 100).toFixed(1)}%)</>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={save} disabled={!valid || !changed}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A single hourly-rate row with debounced inputs and live row-total. */
function ComponentRow({
  label,
  hourlyRate,
  estimatedHours,
  onChangeLabel,
  onChangeRate,
  onChangeHours,
  onDelete,
}: {
  label: string;
  hourlyRate: number;
  estimatedHours: number;
  onChangeLabel: (v: string) => void;
  onChangeRate: (v: number) => void;
  onChangeHours: (v: number) => void;
  onDelete: () => void;
}) {
  // Local string buffers so blank/partial typing stays smooth.
  const [labelDraft, setLabelDraft] = useState(label);
  const [rateDraft, setRateDraft] = useState(hourlyRate ? String(hourlyRate) : '');
  const [hoursDraft, setHoursDraft] = useState(estimatedHours ? String(estimatedHours) : '');
  const labelFocus = useRef(false);
  const rateFocus = useRef(false);
  const hoursFocus = useRef(false);

  // Mirror remote → local when not focused, so external updates reconcile cleanly.
  useEffect(() => {
    if (!labelFocus.current) setLabelDraft(label);
  }, [label]);
  useEffect(() => {
    if (!rateFocus.current) setRateDraft(hourlyRate ? String(hourlyRate) : '');
  }, [hourlyRate]);
  useEffect(() => {
    if (!hoursFocus.current) setHoursDraft(estimatedHours ? String(estimatedHours) : '');
  }, [estimatedHours]);

  const rowTotal = (Number(rateDraft) || 0) * (Number(hoursDraft) || 0);

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 rounded-md border border-border/60 bg-background/40 p-2">
      <div className="flex w-full min-w-0 items-center gap-1">
        <Input
          value={labelDraft}
          placeholder="Label (optional)"
          className="h-7 w-full min-w-0 flex-1 text-xs"
          onFocus={() => { labelFocus.current = true; }}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => {
            labelFocus.current = false;
            if (labelDraft !== label) onChangeLabel(labelDraft);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid w-full min-w-0 grid-cols-2 gap-1.5">
        <div className="relative min-w-0">
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
          <Input
            inputMode="decimal"
            value={rateDraft}
            placeholder="Rate /hr"
            aria-label="Rate per hour"
            className="pl-4 pr-1 h-7 w-full min-w-0 text-xs text-right"
            onFocus={() => { rateFocus.current = true; }}
            onChange={(e) => {
              const v = e.target.value.replace(/[$,\s]/g, '');
              if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) setRateDraft(v);
            }}
            onBlur={() => {
              rateFocus.current = false;
              const n = Number(rateDraft) || 0;
              if (n !== hourlyRate) onChangeRate(n);
            }}
          />
        </div>
        <Input
          inputMode="decimal"
          value={hoursDraft}
          placeholder="Hours"
          aria-label="Estimated hours"
          className="h-7 w-full min-w-0 text-xs text-right"
          onFocus={() => { hoursFocus.current = true; }}
          onChange={(e) => {
            const v = e.target.value.replace(/[,\s]/g, '');
            if (v === '' || /^\d+(\.\d{0,2})?$/.test(v)) setHoursDraft(v);
          }}
          onBlur={() => {
            hoursFocus.current = false;
            const n = Number(hoursDraft) || 0;
            if (n !== estimatedHours) onChangeHours(n);
          }}
        />
      </div>
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Row total</span>
        <span className="text-xs font-medium tabular-nums">{fmtUSD(rowTotal)}</span>
      </div>
    </div>
  );
}


interface FinServMrrFieldProps {
  dealId: string;
  mrr: number | null | undefined;
  mode: 'manual' | 'calculated';
  onMrrCommit: (next: number | null) => void;
  onModeChange: (mode: 'manual' | 'calculated') => void;
  /** Called whenever the calculated total changes, so parent can mirror locally. */
  onCalculatedTotal: (total: number) => void;
}

export function FinServMrrField({
  dealId,
  mrr,
  mode,
  onMrrCommit,
  onModeChange,
  onCalculatedTotal,
}: FinServMrrFieldProps) {
  const { components, total, addComponent, updateComponent, deleteComponent } =
    useFinservMrrComponents(dealId, onCalculatedTotal);

  const isCalc = mode === 'calculated';

  // Load the most recent MRR expansion/contraction change to surface a tag
  // beside the MRR value. Refreshes when mrr changes so a fresh edit updates
  // the badge immediately after the log entry is written.
  const [lastChange, setLastChange] = useState<{
    type: 'expansion' | 'contraction';
    delta: number;
    deltaPct: number | null;
    at: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!dealId) return;
    const load = async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('activity_type, metadata, created_at')
        .eq('deal_id', dealId)
        .in('activity_type', ['mrr_expansion', 'mrr_contraction'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0];
      if (!row) { setLastChange(null); return; }
      const meta = (row.metadata || {}) as Record<string, any>;
      setLastChange({
        type: row.activity_type === 'mrr_expansion' ? 'expansion' : 'contraction',
        delta: Number(meta.delta ?? 0),
        deltaPct: meta.deltaPct == null ? null : Number(meta.deltaPct),
        at: row.created_at,
      });
    };
    load();
    // Refresh shortly after an MRR value change so newly-logged entry appears.
    const t = setTimeout(load, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [dealId, mrr]);

  return (
    <div className="space-y-2 min-w-0 w-full">
      {/* Line 1: label + mode dropdown pill */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-muted-foreground text-sm">MRR</span>
        <Select value={mode} onValueChange={(v) => onModeChange(v as 'manual' | 'calculated')}>
          <SelectTrigger className="h-6 w-auto min-w-[6rem] px-2 py-0 text-xs rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="calculated">Hourly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Line 2: value + Update MRR action */}
      {isCalc ? (
        <div
          className="min-w-0 w-full h-8 px-2 text-sm rounded-md border border-input bg-muted/40 text-foreground flex items-center justify-between"
          title="Calculated from hourly-rate rows"
        >
          <span className="tabular-nums">{fmtUSD(total)}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-2">calculated</span>
        </div>
      ) : (
        <ManualMrrDisplay value={mrr} onCommit={onMrrCommit} />
      )}

      {/* Line 3: last change tag (only when present) */}
      {lastChange && (
        <div className="flex items-center">
          <Badge
            variant="outline"
            className={
              lastChange.type === 'expansion'
                ? 'h-5 px-2 gap-1 text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'h-5 px-2 gap-1 text-[10px] border-rose-500/40 bg-rose-500/10 text-rose-400'
            }
            title={`On ${new Date(lastChange.at).toLocaleDateString()}`}
          >
            {lastChange.type === 'expansion'
              ? <TrendingUp className="h-3 w-3" />
              : <TrendingDown className="h-3 w-3" />}
            <span>
              Last change: {lastChange.type === 'expansion' ? 'Expansion' : 'Contraction'}
              {' '}{lastChange.delta >= 0 ? '+' : '−'}{fmtUSD(Math.abs(lastChange.delta))}
              {lastChange.deltaPct != null && (
                <> ({lastChange.deltaPct > 0 ? '+' : ''}{lastChange.deltaPct.toFixed(1)}%)</>
              )}
            </span>
          </Badge>
        </div>
      )}

      {isCalc && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2 w-full min-w-0">
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/60">
            <span className="text-xs font-medium text-foreground">Hourly breakdown</span>
            <span className="text-xs text-muted-foreground">
              Calculated MRR:{' '}
              <span className="font-semibold text-foreground tabular-nums">{fmtUSD(total)}</span>
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_5rem_minmax(5rem,auto)_2rem] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground px-1">
            <span>Label</span>
            <span className="text-right">Rate /hr</span>
            <span className="text-right">Hours</span>
            <span className="text-right">Row total</span>
            <span />
          </div>
          {components.map((c) => (
            <ComponentRow
              key={c.id}
              label={c.label ?? ''}
              hourlyRate={c.hourlyRate}
              estimatedHours={c.estimatedHours}
              onChangeLabel={(v) => updateComponent(c.id, { label: v || null })}
              onChangeRate={(v) => updateComponent(c.id, { hourlyRate: v })}
              onChangeHours={(v) => updateComponent(c.id, { estimatedHours: v })}
              onDelete={() => deleteComponent(c.id)}
            />
          ))}
          {components.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No rows yet — add one to start building MRR.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => addComponent({ hourlyRate: 0, estimatedHours: 0 })}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add row
          </Button>
        </div>
      )}
    </div>
  );
}
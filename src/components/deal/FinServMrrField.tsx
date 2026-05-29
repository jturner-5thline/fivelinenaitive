import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFinservMrrComponents } from '@/hooks/useFinservMrrComponents';
import { useDebouncedFieldValue, flushOnEnterOrTab } from '@/hooks/useDebouncedFieldValue';

const fmtUSD = (n: number) =>
  (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Manual single-amount input (mirrors the FinServ currency UX). */
function ManualMrrInput({
  value,
  onCommit,
}: {
  value: number | null | undefined;
  onCommit: (next: number | null) => void;
}) {
  const remote = value == null || Number.isNaN(value) ? '' : String(Math.round(value));
  const fmt = remote ? Number(remote).toLocaleString() : '';
  const { value: draft, setValue, flush, onFocus, onBlur } = useDebouncedFieldValue<string>(fmt, {
    equals: (a, b) => a.replace(/[$,\s]/g, '') === b.replace(/[$,\s]/g, ''),
    commit: (d) => {
      const cleaned = d.replace(/[$,\s]/g, '');
      onCommit(cleaned === '' ? null : Number(cleaned));
    },
    debounceMs: 500,
  });
  return (
    <div className="relative w-full">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
      <Input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[$,\s]/g, '');
          if (cleaned === '' || /^\d+$/.test(cleaned)) {
            setValue(cleaned === '' ? '' : Number(cleaned).toLocaleString());
          }
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={flushOnEnterOrTab(flush)}
        placeholder="0"
        className="pl-5 h-8 text-sm w-full"
      />
    </div>
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
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_minmax(4.5rem,auto)_auto] items-center gap-1.5">
      <Input
        value={labelDraft}
        placeholder="Label (optional)"
        className="h-7 text-xs"
        onFocus={() => { labelFocus.current = true; }}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={() => {
          labelFocus.current = false;
          if (labelDraft !== label) onChangeLabel(labelDraft);
        }}
      />
      <div className="relative">
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
        <Input
          inputMode="decimal"
          value={rateDraft}
          placeholder="0"
          className="pl-4 pr-1 h-7 text-xs text-right"
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
        placeholder="0"
        className="h-7 text-xs text-right"
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
      <span className="text-xs font-medium text-right tabular-nums px-1">{fmtUSD(rowTotal)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete row"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
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

  return (
    <div className="space-y-1.5 min-w-0 w-full">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mode toggle pill */}
        <div className="inline-flex rounded-md border border-input bg-background overflow-hidden shrink-0">
          <button
            type="button"
            className={`px-2 h-7 text-[11px] font-medium transition-colors ${
              !isCalc ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => onModeChange('manual')}
          >
            Manual
          </button>
          <button
            type="button"
            className={`px-2 h-7 text-[11px] font-medium transition-colors ${
              isCalc ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => onModeChange('calculated')}
          >
            Hourly
          </button>
        </div>
        {isCalc ? (
          <div
            className="flex-1 min-w-0 h-8 px-2 text-sm rounded-md border border-input bg-muted/40 flex items-center justify-between"
            title="Calculated from hourly-rate rows"
          >
            <span className="tabular-nums">{fmtUSD(total)}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground ml-2">calculated</span>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <ManualMrrInput value={mrr} onCommit={onMrrCommit} />
          </div>
        )}
      </div>

      {isCalc && (
        <div className="rounded-md border border-border bg-muted/20 p-2 space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_minmax(4.5rem,auto)_auto] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground px-1">
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
            <p className="text-[11px] text-muted-foreground text-center py-1">
              No rows yet — add one to start building MRR.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => addComponent({ hourlyRate: 0, estimatedHours: 0 })}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add row
          </Button>
        </div>
      )}
    </div>
  );
}
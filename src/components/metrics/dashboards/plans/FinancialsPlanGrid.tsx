import { sheetKeyDown, sheetFocus, sheetDoubleClick, SHEET_TABLE, SHEET_INPUT, SHEET_WRAP, SHEET_HEAD, SHEET_TH, SHEET_TITLE_TH, SHEET_TITLE_TD, SHEET_GROUP_TD } from '@/lib/sheetGrid';
import { Fragment, forwardRef, useImperativeHandle, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  FINANCIAL_ROWS, FINANCIAL_SEGMENTS, FINANCIAL_YEARS,
  financialMetricKey, financialPeriods, formatFinancial, parseFinancialInput,
} from './financialsPlan';

type Mode = 'monthly' | 'quarterly';
const cellId = (seg: string, row: string, period: string) => `${seg}|${row}|${period}`;

/** Spreadsheet-style editor for Consolidated, FinServ and Debt Services plan financials. */
export interface FinancialsPlanGridHandle { save: () => Promise<boolean>; isDirty: () => boolean }

export const FinancialsPlanGrid = forwardRef<FinancialsPlanGridHandle, { canEdit: boolean; year: number; mode: Mode }>(function FinancialsPlanGrid({ canEdit, year, mode }, ref) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  // Entity sections start collapsed every time the Master Plan opens.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleSeg = (k: string) => setExpanded((e) => { const n = new Set(e); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());

  const periods = useMemo(() => (mode === 'quarterly' ? FINANCIAL_YEARS.flatMap((y) => financialPeriods(y, 'quarterly')) : financialPeriods(year, mode)), [year, mode]);
  const rowsFlat = useMemo(() => FINANCIAL_SEGMENTS.flatMap((s) => FINANCIAL_ROWS.map((r) => ({ seg: s.key, row: r }))), []);

  const load = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('insights_metric_targets')
      .select('metric_key, period_month, target_value')
      .eq('company_id', company.id)
      .like('metric_key', 'plan:financials:%')
      .gte('period_month', `${FINANCIAL_YEARS[0]}-`)
      .lte('period_month', `${FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1]}-~`);
    setLoading(false);
    if (error) { toast.error('Failed to load financials', { description: error.message }); return; }
    const next: Record<string, string> = {};
    for (const r of data ?? []) {
      const [, , seg, row] = r.metric_key.split(':');
      if (r.period_month) next[cellId(seg, row, r.period_month)] = String(r.target_value);
    }
    setValues(next);
    setInitial(next);
  }, [company?.id]);
  useEffect(() => { load(); }, [load]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      try { parseFinancialInput(v); } catch { e[k] = 'Enter a number'; }
    }
    return e;
  }, [values]);
  const dirtyKeys = useMemo(
    () => Array.from(new Set([...Object.keys(values), ...Object.keys(initial)])).filter((k) => (values[k] ?? '').trim() !== (initial[k] ?? '').trim()),
    [values, initial],
  );

  async function save(): Promise<boolean> {
    if (!company?.id || !user?.id) return false;
    if (Object.keys(errors).length) { toast.error('Fix invalid cells before saving'); return false; }
    if (dirtyKeys.length === 0) return true;
    setSaving(true);
    try {
      const upserts: any[] = [];
      const deletes: { key: string; period: string }[] = [];
      for (const k of dirtyKeys) {
        const [seg, row, period] = k.split('|');
        const n = parseFinancialInput(values[k] ?? '');
        const metric_key = financialMetricKey(seg, row);
        if (n === null) deletes.push({ key: metric_key, period });
        else {
          const segLabel = FINANCIAL_SEGMENTS.find((s) => s.key === seg)?.label;
          const rowLabel = FINANCIAL_ROWS.find((r) => r.key === row)?.label;
          upserts.push({ company_id: company.id, owner_user_id: user.id, metric_key, metric_label: `Financials · ${segLabel} · ${rowLabel}`, period_month: period, target_value: n });
        }
      }
      if (upserts.length) {
        const { error } = await supabase.from('insights_metric_targets').upsert(upserts, { onConflict: 'company_id,metric_key,period_month' });
        if (error) throw error;
      }
      for (const d of deletes) {
        const { error } = await supabase.from('insights_metric_targets').delete().eq('company_id', company.id).eq('metric_key', d.key).eq('period_month', d.period);
        if (error) throw error;
      }
      toast.success(`Financials saved — ${dirtyKeys.length} cell${dirtyKeys.length === 1 ? '' : 's'} updated`);
      await load();
      return true;
    } catch (e: any) {
      toast.error('Failed to save financials', { description: e?.message });
      return false;
    } finally { setSaving(false); }
  }

  useImperativeHandle(ref, () => ({ save, isDirty: () => dirtyKeys.length > 0 }));

  /** Paste a block copied from Excel (tabs/newlines) starting at this cell. */
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    setValues((v) => {
      const next = { ...v };
      lines.forEach((line, i) => line.split('\t').forEach((cell, j) => {
        const t = rowsFlat[r + i]; const p = periods[c + j];
        if (t && p) next[cellId(t.seg, t.row.key, p.key)] = cell.trim();
      }));
      return next;
    });
  }

  const toggle = (active: boolean) => cn('h-8 px-3 text-xs', active ? '' : 'text-muted-foreground');

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setExpanded(new Set(FINANCIAL_SEGMENTS.map((x) => x.key)))}>Expand all</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setExpanded(new Set())}>Collapse all</Button>
          <span>Monthly and quarterly figures are entered separately. Paste from Excel works.</span>
          {canEdit && (
            <Button size="sm" className="h-8" disabled={saving || dirtyKeys.length === 0} onClick={save}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save financials{dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}
            </Button>
          )}
          {canEdit && dirtyKeys.length > 0 && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setValues(initial)}>Discard</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className={SHEET_WRAP}>
          <table className={SHEET_TABLE}>
            <thead className={SHEET_HEAD}>
              <tr>
                <th className={SHEET_TITLE_TH}>Line item</th>
                {periods.map((p) => <th key={p.key} className={cn(SHEET_TH, 'min-w-24')}>{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {FINANCIAL_SEGMENTS.map((seg, si) => (
                <Fragment key={seg.key}>
                  <tr className="cursor-pointer" onClick={() => toggleSeg(seg.key)}>
                    <td colSpan={1 + periods.length} className={SHEET_GROUP_TD}>
                      <button type="button" aria-expanded={expanded.has(seg.key)} className="inline-flex items-center gap-1.5 uppercase hover:text-primary/80">
                        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded.has(seg.key) && 'rotate-90')} />
                        {seg.label}
                      </button>
                    </td>
                  </tr>
                  {expanded.has(seg.key) && FINANCIAL_ROWS.map((row, ri) => {
                    const r = si * FINANCIAL_ROWS.length + ri;
                    return (
                      <tr key={row.key} className="hover:bg-muted/20">
                        <td className={SHEET_TITLE_TD}>
                          <span className={row.format === 'percent' ? 'pl-3 text-muted-foreground' : 'font-medium'}>{row.label}</span>
                        </td>
                        {periods.map((p, c) => {
                          const k = cellId(seg.key, row.key, p.key);
                          const raw = values[k] ?? '';
                          const err = errors[k];
                          let display = raw;
                          if (focused !== k && raw.trim() && !err) display = formatFinancial(parseFinancialInput(raw)!, row.format);
                          const dirty = (raw.trim()) !== (initial[k] ?? '').trim();
                          return (
                            <td key={p.key} className="p-0">
                              <input
                                ref={(el) => { if (el) inputs.current.set(k, el); else inputs.current.delete(k); }}
                                aria-label={`${seg.label} ${row.label} ${p.label}`}
                                value={display}
                                readOnly={!canEdit}
                                inputMode="decimal"
                                placeholder=""
                                title={err}
                                data-row={r}
                                data-col={c}
                                onDoubleClick={sheetDoubleClick}
                                onFocus={(e) => { setFocused(k); sheetFocus(e); }}
                                onBlur={() => setFocused((f) => (f === k ? null : f))}
                                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setValues((v) => ({ ...v, [k]: initial[k] ?? '' })); return; } if ((e.key === 'Delete' || e.key === 'Backspace') && e.currentTarget.dataset.editing !== '1') { e.preventDefault(); setValues((v) => ({ ...v, [k]: '' })); return; } sheetKeyDown(e); }}
                                onPaste={(e) => onPaste(e, r, c)}
                                className={cn(
                                  SHEET_INPUT,
                                  display.startsWith('-') && 'text-destructive',
                                  dirty && 'bg-primary/10',
                                  err && 'outline outline-1 -outline-offset-1 outline-destructive',
                                )}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

import { monthHeaderLabel, FINANCIAL_YEARS } from '@/components/metrics/dashboards/plans/financialsPlan';
import { type PlanMode } from '@/components/metrics/dashboards/plans/PlanPeriodToggles';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useCompany } from '@/hooks/useCompany';
import { useCanEditMasterPlan } from '@/hooks/useCanEditMasterPlan';
import { useMonthlyHeadcount } from '@/hooks/useMonthlyHeadcount';
import { HEADCOUNT_COMPANY_ID, HEADCOUNT_UNITS, HEADCOUNT_MONTHS, headcountKey, headcountSummary, headcountMonthlyTotal, HEADCOUNT_DUPLICATE_NOTE, parseHeadcount, type HeadcountDraft } from '@/lib/monthlyHeadcount';
import { sheetKeyDown, sheetFocus, sheetDoubleClick, SHEET_TABLE, SHEET_INPUT, SHEET_WRAP, SHEET_HEAD, SHEET_TH, SHEET_TITLE_TH, SHEET_TITLE_TD, SHEET_VALUE_TD } from '@/lib/sheetGrid';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Headcount tab of the Master Plan: 5th Line only, spreadsheet-style. */
export type HeadcountGridHandle = { save: () => Promise<boolean>; isDirty: () => boolean; isInvalid: () => boolean };

/** Saving is driven by the Master Plan dialog's "Save master plan" button through the ref. */
export const HeadcountGrid = forwardRef<HeadcountGridHandle, { year?: number; mode?: PlanMode }>(function HeadcountGrid({ year = FINANCIAL_YEARS[0], mode = 'monthly' }, ref) {
  const { company } = useCompany();
  const { canEditMasterPlan } = useCanEditMasterPlan();
  if (company?.id !== HEADCOUNT_COMPANY_ID) return null;
  return <HeadcountTable ref={ref} companyId={company.id} canEdit={canEditMasterPlan} year={year} mode={mode} />;
});

const HeadcountTable = forwardRef<HeadcountGridHandle, { companyId: string; canEdit: boolean; year: number; mode: PlanMode }>(function HeadcountTable({ companyId, canEdit, year, mode }, ref) {
  const [draft, setDraft] = useState<HeadcountDraft | null>(null);
  // Year/mode are controlled by the Master Plan header, which confirms discards first.
  useEffect(() => { setDraft(null); }, [year, mode]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const query = useMonthlyHeadcount(companyId, year, true);
  const baseline = query.data ?? {};
  const values = draft ?? baseline;
  const dirty = draft !== null && Object.keys({ ...baseline, ...draft }).some(key => (draft[key] ?? '') !== (baseline[key] ?? ''));
  const invalid = Object.values(values).some(value => { try { parseHeadcount(value); return false; } catch { return true; } });
  const fmt = (n: number | null) => n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const summary = (entries: string[]) => { try { return headcountSummary(entries); } catch { return { total: 0, average: null }; } };
  function request(action: () => void) { if (saving) return; if (dirty) setPending(() => action); else action(); }
  async function save(): Promise<boolean> {
    if (!canEdit || saving) return false;
    if (invalid) { toast.error('Fix invalid headcount cells before saving'); return false; }
    if (!draft || !dirty || !query.isSuccess) { toast.info('No headcount changes to save'); return true; }
    setSaving(true);
    try { await query.save(draft, baseline); setDraft(null); toast.success('Headcount saved'); return true; }
    catch { toast.error('Headcount could not be saved. Your changes are still here; please retry.'); return false; }
    finally { setSaving(false); }
  }
  useImperativeHandle(ref, () => ({ save, isDirty: () => dirty, isInvalid: () => invalid }));
  const monthTotal = (i: number) => { try { return headcountMonthlyTotal(HEADCOUNT_UNITS.map(u => values[headcountKey(u.realmId, i)] ?? '')); } catch { return null; } };
  return <div className="space-y-2 min-w-0 max-w-full">
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">FTE by unit · {dirty ? 'Unsaved changes' : 'Saved'}</span>
    </div>
    {mode === 'quarterly' ? <HeadcountQuarterly companyId={companyId} fmt={fmt} /> : query.isPending ? <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : query.isError ? <div className="py-8 text-center"><p className="text-destructive mb-3">Headcount could not be loaded.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> :
      <div className={SHEET_WRAP}>
        <table className={SHEET_TABLE}>
          <thead className={SHEET_HEAD}><tr><th className={SHEET_TITLE_TH}>Unit</th>{HEADCOUNT_MONTHS.map((m, i) => <th key={m} className={cn(SHEET_TH, 'min-w-24')}>{monthHeaderLabel(year, i)}</th>)}<th className={SHEET_TH} title="Average of entered months; blank months are not counted">Annual avg.</th></tr></thead>
          <tbody>{HEADCOUNT_UNITS.map((unit, row) => <tr key={unit.realmId} className="hover:bg-muted/20">
            <th scope="row" className={cn(SHEET_TITLE_TD, 'font-medium')} title={unit.name}>{unit.label}</th>
            {HEADCOUNT_MONTHS.map((month, index) => { const key = headcountKey(unit.realmId, index); const value = values[key] ?? ''; let valid = true; try { parseHeadcount(value); } catch { valid = false; }
              return <td key={month} className={cn('p-0', value !== (baseline[key] ?? '') && 'bg-primary/10', !valid && 'bg-destructive/15')}>
                <input aria-label={`${unit.label} ${month} ${year}`} aria-invalid={!valid} inputMode="decimal" value={value} disabled={!canEdit || saving}
                  data-row={row} data-col={index} className={cn(SHEET_INPUT, !valid && 'text-destructive')}
                  onChange={e => setDraft({ ...values, [key]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft({ ...values, [key]: baseline[key] ?? '' }); return; } if ((e.key === 'Delete' || e.key === 'Backspace') && e.currentTarget.dataset.editing !== '1') { e.preventDefault(); setDraft({ ...values, [key]: '' }); return; } sheetKeyDown(e); }}
                  onFocus={sheetFocus} onDoubleClick={sheetDoubleClick} /></td>; })}
            <td className={cn(SHEET_VALUE_TD, 'bg-muted/40')}>{fmt(summary(HEADCOUNT_MONTHS.map((_, i) => values[headcountKey(unit.realmId, i)] ?? '')).average)}</td>
          </tr>)}</tbody>
          <tfoot><tr className="font-medium bg-muted/40"><th className={cn(SHEET_TITLE_TD, 'bg-secondary')}><span title={HEADCOUNT_DUPLICATE_NOTE} className="cursor-help underline decoration-dotted underline-offset-4">Total</span></th>
            {HEADCOUNT_MONTHS.map((m, i) => <td key={m} title={HEADCOUNT_DUPLICATE_NOTE} className={SHEET_VALUE_TD}>{fmt(monthTotal(i))}</td>)}
            <td title={HEADCOUNT_DUPLICATE_NOTE} className={SHEET_VALUE_TD}>{fmt(summary(HEADCOUNT_MONTHS.map((_, i) => { const t = monthTotal(i); return t === null ? '' : String(Math.round(t * 100) / 100); })).average)}</td></tr></tfoot>
        </table>
      </div>}
    {invalid && <p role="alert" className="text-sm text-destructive">Enter a headcount from 0 to 9,999.99 with up to two decimal places.</p>}
    {canEdit && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(null)}>Discard</Button></div>}
    <AlertDialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved headcount?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { pending?.(); setPending(null); }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
});

/** Quarterly view: read-only average FTE per quarter for each plan year (headcount is entered monthly). */
function HeadcountQuarterly({ companyId, fmt }: { companyId: string; fmt: (n: number | null) => string }) {
  const q0 = useMonthlyHeadcount(companyId, FINANCIAL_YEARS[0], true);
  const q1 = useMonthlyHeadcount(companyId, FINANCIAL_YEARS[1], true);
  const byYear = [q0.data ?? {}, q1.data ?? {}];
  if (q0.isPending || q1.isPending) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const cols = FINANCIAL_YEARS.flatMap((y, yi) => [0, 1, 2, 3].map((q) => ({ key: `${y}-Q${q + 1}`, label: `Q${q + 1} ${y}`, yi, months: [q * 3, q * 3 + 1, q * 3 + 2] })));
  const avg = (vals: string[]) => { try { return headcountSummary(vals).average; } catch { return null; } };
  const total = (yi: number, m: number) => { try { return headcountMonthlyTotal(HEADCOUNT_UNITS.map(u => byYear[yi][headcountKey(u.realmId, m)] ?? '')); } catch { return null; } };
  return <div className={SHEET_WRAP}>
    <table className={SHEET_TABLE}>
      <thead className={SHEET_HEAD}><tr><th className={SHEET_TITLE_TH}>Unit</th>{cols.map(c => <th key={c.key} className={cn(SHEET_TH, 'min-w-24')}>{c.label}</th>)}</tr></thead>
      <tbody>{HEADCOUNT_UNITS.map(unit => <tr key={unit.realmId} className="hover:bg-muted/20">
        <th scope="row" className={cn(SHEET_TITLE_TD, 'font-medium')} title={unit.name}>{unit.label}</th>
        {cols.map(c => <td key={c.key} className={SHEET_VALUE_TD} title="Average of entered months in the quarter">{fmt(avg(c.months.map(m => byYear[c.yi][headcountKey(unit.realmId, m)] ?? '')))}</td>)}
      </tr>)}</tbody>
      <tfoot><tr className="font-medium bg-muted/40"><th className={cn(SHEET_TITLE_TD, 'bg-secondary')} title={HEADCOUNT_DUPLICATE_NOTE}>Total</th>
        {cols.map(c => <td key={c.key} className={SHEET_VALUE_TD} title={HEADCOUNT_DUPLICATE_NOTE}>{fmt(avg(c.months.map(m => { const t = total(c.yi, m); return t === null ? '' : String(Math.round(t * 100) / 100); })))}</td>)}</tr></tfoot>
    </table>
    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Quarterly headcount is the average of the monthly entries. Switch to Monthly to edit.</p>
  </div>;
}

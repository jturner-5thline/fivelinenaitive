import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useCompany } from '@/hooks/useCompany';
import { useCanEditMasterPlan } from '@/hooks/useCanEditMasterPlan';
import { useMonthlyHeadcount } from '@/hooks/useMonthlyHeadcount';
import { HEADCOUNT_COMPANY_ID, HEADCOUNT_UNITS, HEADCOUNT_MONTHS, headcountKey, headcountSummary, parseHeadcount, type HeadcountDraft } from '@/lib/monthlyHeadcount';
import { toast } from 'sonner';

export function HeadcountButton() {
  const { company } = useCompany();
  const { canEditMasterPlan } = useCanEditMasterPlan();
  const [open, setOpen] = useState(false);
  if (company?.id !== HEADCOUNT_COMPANY_ID) return null;
  return <>
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(true)}><Users className="h-3.5 w-3.5" />Headcount</Button>
    {open && <HeadcountDialog companyId={company.id} canEdit={canEditMasterPlan} onClose={() => setOpen(false)} />}
  </>;
}

function HeadcountDialog({ companyId, canEdit, onClose }: { companyId: string; canEdit: boolean; onClose: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [draft, setDraft] = useState<HeadcountDraft | null>(null);
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
  function changeYear(next: number) { request(() => { setDraft(null); setYear(next); }); }
  async function save() {
    if (!draft || !query.isSuccess) return;
    setSaving(true);
    try { await query.save(draft, baseline); setDraft(null); toast.success('Headcount saved'); }
    catch { toast.error('Headcount could not be saved. Your changes are still here; please retry.'); }
    finally { setSaving(false); }
  }
  return <>
    <Dialog open onOpenChange={open => { if (!open) request(onClose); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[1440px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Monthly Headcount</DialogTitle><DialogDescription>5th Line · FTE by unit</DialogDescription></DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{dirty ? 'Unsaved changes' : 'Headcount'}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Previous year" disabled={saving || year <= 1900} onClick={() => changeYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-12 text-center font-mono tabular-nums">{year}</span>
            <Button variant="ghost" size="icon" aria-label="Next year" disabled={saving || year >= 2200} onClick={() => changeYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {query.isPending ? <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : query.isError ? <div className="py-8 text-center"><p className="text-destructive mb-3">Headcount could not be loaded.</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div> :
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[1160px] text-sm">
              <thead><tr className="border-b border-border bg-muted/40"><th className="sticky left-0 z-10 bg-background px-4 py-3 text-left w-44">Unit</th>{HEADCOUNT_MONTHS.map(month => <th key={month} className="px-2 py-3 text-center font-medium">{month}</th>)}<th className="px-3 py-3 text-right whitespace-nowrap" title="Average of entered months; blank months are not counted">Annual avg.</th></tr></thead>
              <tbody>{HEADCOUNT_UNITS.map((unit, row) => <tr key={unit.realmId} className="border-b border-border">
                <th scope="row" className="sticky left-0 z-10 bg-background px-4 py-4 text-left font-medium" title={unit.name}>{unit.label}</th>
                {HEADCOUNT_MONTHS.map((month, index) => { const key = headcountKey(unit.realmId, index); const value = values[key] ?? ''; let valid = true; try { parseHeadcount(value); } catch { valid = false; }
                  return <td key={month} className="px-1.5 py-3"><Input aria-label={`${unit.label} ${month} ${year}`} aria-invalid={!valid} inputMode="decimal" value={value} placeholder="—" disabled={!canEdit || saving} className="h-9 w-[68px] text-center tabular-nums font-mono" onChange={e => setDraft({ ...values, [key]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const nextUnit = HEADCOUNT_UNITS[row + 1]; if (nextUnit) document.getElementById(`headcount-${nextUnit.realmId}-${index}`)?.focus(); } }} id={`headcount-${unit.realmId}-${index}`} /></td>;
                })}<td className="px-3 py-4 text-right font-mono tabular-nums">{fmt(summary(HEADCOUNT_MONTHS.map((_, i) => values[headcountKey(unit.realmId, i)] ?? '')).average)}</td>
              </tr>)}</tbody>
              <tfoot><tr className="bg-muted/40 font-medium"><th className="sticky left-0 z-10 bg-background px-4 py-4 text-left">Total</th>{HEADCOUNT_MONTHS.map((month, i) => { const entries = HEADCOUNT_UNITS.map(unit => values[headcountKey(unit.realmId, i)] ?? ''); return <td key={month} className="text-center font-mono tabular-nums">{fmt(entries.some(v => v.trim()) ? summary(entries).total : null)}</td>; })}<td className="px-3 text-right font-mono tabular-nums">{fmt(summary(HEADCOUNT_MONTHS.map((_, i) => { const entries = HEADCOUNT_UNITS.map(unit => values[headcountKey(unit.realmId, i)] ?? ''); return entries.some(v => v.trim()) ? String(summary(entries).total) : ''; })).average)}</td></tr></tfoot>
            </table>
          </div>}
        {invalid && <p role="alert" className="text-sm text-destructive">Enter a headcount from 0 to 9,999.99 with up to two decimal places.</p>}
        {canEdit && <div className="flex justify-end gap-2"><Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(null)}>Discard</Button><Button disabled={!dirty || invalid || saving || !query.isSuccess} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Changes</Button></div>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved headcount?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { pending?.(); setPending(null); }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileUp, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  LENDER_FIELDS, autoMapHeader, buildLenderTemplateCsv, downloadCsv, isStandardTemplate, parseCsv, rowToLender,
} from '@/utils/lenderCsv';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
}

type Step = 'upload' | 'map' | 'preview';
const SKIP = '__skip__';

export function downloadLenderTemplate() {
  downloadCsv(buildLenderTemplateCsv(), 'funding-sources-template.csv');
}

export function ImportLendersCsvDialog({ open, onOpenChange, existing, onDone }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string | null>>({});
  const [standard, setStandard] = useState(false);
  const [dupMode, setDupMode] = useState<'update' | 'skip'>('update');
  const [busy, setBusy] = useState(false);

  const reset = () => { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setStandard(false); };

  const handleFile = async (file: File) => {
    try {
      let table: string[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const wb = XLSX.read(await file.arrayBuffer());
        table = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as any[][])
          .map(r => r.map(v => String(v ?? ''))).filter(r => r.some(v => v.trim()));
      } else {
        table = parseCsv(await file.text());
      }
      if (table.length < 2) throw new Error('The file needs a header row and at least one funding source.');
      const [h, ...data] = table;
      const m: Record<number, string | null> = {};
      const used = new Set<string>();
      h.forEach((col, i) => {
        const k = autoMapHeader(col);
        m[i] = k && !used.has(k) ? k : null;
        if (k) used.add(k);
      });
      setHeaders(h); setRows(data); setMapping(m);
      const std = isStandardTemplate(h);
      setStandard(std);
      setStep(std ? 'preview' : 'map');
    } catch (e) {
      toast({ title: 'Could not read file', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const nameMapped = Object.values(mapping).includes('name');
  const parsed = useMemo(
    () => rows.map(r => rowToLender(headers, r, mapping)).filter(l => l.name),
    [rows, headers, mapping],
  );
  const existingByName = useMemo(() => {
    const m = new Map<string, string>();
    existing.forEach(l => m.set(l.name.trim().toLowerCase(), l.id));
    return m;
  }, [existing]);
  const newCount = parsed.filter(l => !existingByName.has(String(l.name).trim().toLowerCase())).length;
  const dupCount = parsed.length - newCount;

  const runImport = async () => {
    if (!user) return;
    setBusy(true);
    let added = 0, updated = 0, skipped = 0, failed = 0;
    try {
      // Collapse duplicate names within the file (last row wins, merged).
      const byName = new Map<string, Record<string, any>>();
      parsed.forEach(l => {
        const k = String(l.name).trim().toLowerCase();
        byName.set(k, { ...(byName.get(k) ?? {}), ...l });
      });
      const inserts: Record<string, any>[] = [];
      for (const [k, l] of byName) {
        const id = existingByName.get(k);
        if (!id) { inserts.push({ ...l, user_id: user.id }); continue; }
        if (dupMode === 'skip') { skipped++; continue; }
        const { name: _n, ...fields } = l;
        if (!Object.keys(fields).length) { skipped++; continue; }
        const { error } = await supabase.from('master_lenders').update(fields as any).eq('id', id);
        if (error) failed++; else updated++;
      }
      for (let i = 0; i < inserts.length; i += 100) {
        const batch = inserts.slice(i, i + 100);
        const { data, error } = await supabase.from('master_lenders').insert(batch as any).select('id');
        if (error) { failed += batch.length; console.error(error); } else added += data?.length ?? 0;
      }
      toast({
        title: failed ? 'Import finished with errors' : 'Import complete',
        description: `Added ${added}, updated ${updated}, skipped ${skipped}${failed ? `, failed ${failed}` : ''}.`,
        variant: failed ? 'destructive' : undefined,
      });
      await onDone();
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import funding sources</DialogTitle>
          <DialogDescription>
            New funding sources are added to your directory. Nothing existing is deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] p-10 cursor-pointer hover:bg-[var(--bg-card-hover)]">
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm">Choose a CSV or Excel file</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </label>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Use the template (or an exported file) to skip column matching.</span>
                <Button variant="outline" size="sm" onClick={downloadLenderTemplate}>
                  <Download className="h-4 w-4 mr-2" /> Download template
                </Button>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Match each column in your file to a funding source field.</p>
              <div className="rounded-md border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                {headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr] gap-3 items-center px-3 py-2 text-sm">
                    <span className="font-medium truncate">{h || `(column ${i + 1})`}</span>
                    <span className="truncate text-muted-foreground">{rows[0]?.[i] || '—'}</span>
                    <Select value={mapping[i] ?? SKIP} onValueChange={(v) => setMapping(m => ({ ...m, [i]: v === SKIP ? null : v }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={SKIP}>Don't import</SelectItem>
                        {LENDER_FIELDS.map(f => <SelectItem key={f.key} value={f.key}>{f.header}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!nameMapped && <p className="text-sm text-destructive">Pick which column holds the Lender Name.</p>}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {standard && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Standard template recognized — all columns matched automatically.
                </div>
              )}
              <p className="text-sm">
                <span className="font-mono">{parsed.length}</span> funding sources found:{' '}
                <span className="font-mono">{newCount}</span> new, <span className="font-mono">{dupCount}</span> already in your directory.
              </p>
              {dupCount > 0 && (
                <RadioGroup value={dupMode} onValueChange={(v) => setDupMode(v as any)} className="space-y-1">
                  <div className="flex items-center gap-2"><RadioGroupItem value="update" id="dup-u" />
                    <Label htmlFor="dup-u">Update existing ones with the values in this file</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="skip" id="dup-s" />
                    <Label htmlFor="dup-s">Leave existing ones untouched, only add new</Label></div>
                </RadioGroup>
              )}
              <div className="rounded-md border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-sm">
                {parsed.slice(0, 8).map((l, i) => (
                  <div key={i} className="px-3 py-2 flex justify-between gap-3">
                    <span className="truncate">{l.name}</span>
                    <span className="text-muted-foreground truncate">{[l.lender_type, l.contact_name, l.email].filter(Boolean).join(' · ')}</span>
                  </div>
                ))}
                {parsed.length > 8 && <div className="px-3 py-2 text-muted-foreground">…and {parsed.length - 8} more</div>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== 'upload' && <Button variant="ghost" onClick={reset} disabled={busy}>Start over</Button>}
          {step === 'map' && <Button disabled={!nameMapped} onClick={() => setStep('preview')}>Continue</Button>}
          {step === 'preview' && (
            <>
              {!standard && <Button variant="outline" onClick={() => setStep('map')} disabled={busy}>Back to matching</Button>}
              <Button onClick={runImport} disabled={busy || parsed.length === 0}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Import {parsed.length}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

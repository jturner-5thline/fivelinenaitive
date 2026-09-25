import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  type CsvSchema, autoMapHeaders, buildTemplateCsv, downloadCsv, isStandardTemplate, readTableFile, rowToRecord,
} from '@/utils/entityCsv';

export interface EntityImportConfig {
  table: 'deals' | 'contacts' | 'crm_companies';
  schema: CsvSchema;
  /** Plural noun, lower case, e.g. "deals". */
  noun: string;
  templateFilename: string;
  /** Text explaining what column is needed when the mapping is incomplete. */
  requiredHint: string;
  mappingReady: (mappedKeys: Set<string>) => boolean;
  isImportable: (rec: Record<string, any>) => boolean;
  /** Candidate identity keys for duplicate detection, strongest first. */
  identityKeys: (rec: Record<string, any>) => string[];
  /** Map of identity key → existing record id. */
  loadExisting: () => Promise<Map<string, string>>;
  /** Final shaping: scope columns, lookups. Returns rows ready for insert/update (in same order). */
  prepare: (recs: Record<string, any>[], mode: 'insert' | 'update') => Promise<Record<string, any>[]>;
  summary: (rec: Record<string, any>) => { title: string; detail: string };
}

export function downloadEntityTemplate(cfg: Pick<EntityImportConfig, 'schema' | 'templateFilename'>) {
  downloadCsv(buildTemplateCsv(cfg.schema), cfg.templateFilename);
}

type Step = 'upload' | 'map' | 'preview';
const SKIP = '__skip__';

export function EntityCsvImportDialog({
  open, onOpenChange, config, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; config: EntityImportConfig; onDone?: () => void | Promise<void> }) {
  const { schema, noun } = config;
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string | null>>({});
  const [standard, setStandard] = useState(false);
  const [dupMode, setDupMode] = useState<'update' | 'skip'>('update');
  const [existing, setExisting] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);

  const reset = () => { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setStandard(false); };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const table = await readTableFile(file);
      if (table.length < 2) throw new Error(`The file needs a header row and at least one row of ${noun}.`);
      const [h, ...data] = table;
      const [ex] = await Promise.all([config.loadExisting()]);
      setExisting(ex);
      setHeaders(h); setRows(data); setMapping(autoMapHeaders(schema, h));
      const std = isStandardTemplate(schema, h);
      setStandard(std);
      setStep(std ? 'preview' : 'map');
    } catch (e) {
      toast.error('Could not read file', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const mappedKeys = useMemo(() => new Set(Object.values(mapping).filter(Boolean) as string[]), [mapping]);
  const ready = config.mappingReady(mappedKeys);

  // Parse and collapse duplicates inside the file (last row wins, merged).
  const parsed = useMemo(() => {
    const out: { rec: Record<string, any>; existingId?: string }[] = [];
    const byKey = new Map<string, number>();
    for (const r of rows) {
      const rec = rowToRecord(schema, r, mapping);
      if (!config.isImportable(rec)) continue;
      const keys = config.identityKeys(rec);
      const hit = keys.map(k => byKey.get(k)).find(v => v !== undefined);
      if (hit !== undefined) {
        out[hit].rec = { ...out[hit].rec, ...rec };
        keys.forEach(k => byKey.set(k, hit));
        continue;
      }
      const existingId = keys.map(k => existing.get(k)).find(Boolean);
      byKey.size; keys.forEach(k => byKey.set(k, out.length));
      out.push({ rec, existingId });
    }
    return out;
  }, [rows, mapping, schema, config, existing]);

  const dupCount = parsed.filter(p => p.existingId).length;
  const newCount = parsed.length - dupCount;

  const runImport = async () => {
    setBusy(true);
    let added = 0, updated = 0, skipped = 0, failed = 0;
    try {
      const toInsert = parsed.filter(p => !p.existingId).map(p => p.rec);
      const toUpdate = parsed.filter(p => p.existingId);
      if (dupMode === 'skip') skipped = toUpdate.length;
      else if (toUpdate.length) {
        const prepared = await config.prepare(toUpdate.map(p => p.rec), 'update');
        for (let i = 0; i < prepared.length; i++) {
          const fields = prepared[i];
          if (!Object.keys(fields).length) { skipped++; continue; }
          const { error } = await (supabase.from(config.table) as any).update(fields).eq('id', toUpdate[i].existingId);
          if (error) { failed++; console.error(error); } else updated++;
        }
      }
      if (toInsert.length) {
        const prepared = await config.prepare(toInsert, 'insert');
        for (let i = 0; i < prepared.length; i += 100) {
          const batch = prepared.slice(i, i + 100);
          const { data, error } = await (supabase.from(config.table) as any).insert(batch).select('id');
          if (!error) { added += data?.length ?? 0; continue; }
          // Fall back row-by-row so one bad row doesn't sink the batch.
          for (const row of batch) {
            const { error: e2 } = await (supabase.from(config.table) as any).insert(row);
            if (e2) { failed++; console.error(e2); } else added++;
          }
        }
      }
      const desc = `Added ${added}, updated ${updated}, skipped ${skipped}${failed ? `, failed ${failed}` : ''}.`;
      if (failed) toast.error('Import finished with errors', { description: desc });
      else toast.success('Import complete', { description: desc });
      await onDone?.();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error('Import failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const writable = schema.fields.filter(f => !f.readOnly);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {noun}</DialogTitle>
          <DialogDescription>New {noun} are added. Nothing existing is deleted.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] p-10 cursor-pointer hover:bg-[var(--bg-card-hover)]">
                {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <FileUp className="h-6 w-6 text-muted-foreground" />}
                <span className="text-sm">Choose a CSV or Excel file</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" disabled={busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </label>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Use the template (or an exported file) to skip column matching.</span>
                <Button variant="outline" size="sm" onClick={() => downloadEntityTemplate(config)}>
                  <Download className="h-4 w-4 mr-2" /> Download template
                </Button>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Match each column in your file to a field.</p>
              <div className="rounded-md border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                {headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 items-center px-3 py-2 text-sm">
                    <span className="font-medium truncate">{h || `(column ${i + 1})`}</span>
                    <span className="truncate text-muted-foreground">{rows[0]?.[i] || '—'}</span>
                    <Select value={mapping[i] ?? SKIP} onValueChange={(v) => setMapping(m => ({ ...m, [i]: v === SKIP ? null : v }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value={SKIP}>Don't import</SelectItem>
                        {writable.map(f => <SelectItem key={f.key} value={f.key}>{f.header}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!ready && <p className="text-sm text-destructive">{config.requiredHint}</p>}
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
                <span className="font-mono">{parsed.length}</span> {noun} found:{' '}
                <span className="font-mono">{newCount}</span> new, <span className="font-mono">{dupCount}</span> already exist.
              </p>
              {dupCount > 0 && (
                <RadioGroup value={dupMode} onValueChange={(v) => setDupMode(v as any)} className="space-y-1">
                  <div className="flex items-center gap-2"><RadioGroupItem value="update" id="edup-u" />
                    <Label htmlFor="edup-u">Update existing ones with the values in this file</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="skip" id="edup-s" />
                    <Label htmlFor="edup-s">Leave existing ones untouched, only add new</Label></div>
                </RadioGroup>
              )}
              <div className="rounded-md border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] text-sm">
                {parsed.slice(0, 8).map((p, i) => {
                  const s = config.summary(p.rec);
                  return (
                    <div key={i} className="px-3 py-2 flex justify-between gap-3">
                      <span className="truncate">{s.title}{p.existingId && <span className="ml-2 text-xs text-muted-foreground">(exists)</span>}</span>
                      <span className="text-muted-foreground truncate">{s.detail}</span>
                    </div>
                  );
                })}
                {parsed.length > 8 && <div className="px-3 py-2 text-muted-foreground">…and {parsed.length - 8} more</div>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step !== 'upload' && <Button variant="ghost" onClick={reset} disabled={busy}>Start over</Button>}
          {step === 'map' && <Button disabled={!ready} onClick={() => setStep('preview')}>Continue</Button>}
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

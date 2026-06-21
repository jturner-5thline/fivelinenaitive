import { useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Target CRM company fields the user can map source columns to.
const TARGET_FIELDS: { value: string; label: string; required?: boolean }[] = [
  { value: 'name', label: 'Company Name', required: true },
  { value: 'domain', label: 'Domain' },
  { value: 'website_url', label: 'Website' },
  { value: 'industry', label: 'Industry' },
  { value: 'segment', label: 'Segment' },
  { value: 'employee_range', label: 'Employee Range' },
  { value: 'employee_count', label: 'Employee Count' },
  { value: 'hq_city', label: 'City' },
  { value: 'hq_country', label: 'Country' },
  { value: 'hq_address', label: 'HQ Address' },
  { value: 'address', label: 'Address' },
  { value: 'phone', label: 'Phone' },
  { value: 'main_contact_email', label: 'Main Email' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'description', label: 'Description' },
  { value: 'notes', label: 'Notes' },
  { value: 'company_type', label: 'Type (prospect/customer/...)' },
  { value: 'status', label: 'Status' },
  { value: 'lifecycle_stage', label: 'Lifecycle Stage' },
];

const SKIP = '__skip__';

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  const norms = TARGET_FIELDS.map(f => ({ ...f, n: normalize(f.value), nl: normalize(f.label) }));
  for (const h of headers) {
    const nh = normalize(h);
    if (!nh) { map[h] = SKIP; continue; }
    let hit = norms.find(f => !used.has(f.value) && (f.n === nh || f.nl === nh));
    if (!hit) {
      // Common aliases
      const aliases: Record<string, string> = {
        company: 'name', companyname: 'name', accountname: 'name', account: 'name', organization: 'name', org: 'name',
        website: 'website_url', url: 'website_url', site: 'website_url',
        city: 'hq_city', country: 'hq_country', email: 'main_contact_email', emailaddress: 'main_contact_email',
        linkedin: 'linkedin_url', employees: 'employee_count', headcount: 'employee_count', size: 'employee_range',
        type: 'company_type', stage: 'lifecycle_stage',
      };
      const target = aliases[nh];
      if (target) hit = norms.find(f => f.value === target && !used.has(f.value));
    }
    if (!hit) {
      // partial contains match
      hit = norms.find(f => !used.has(f.value) && (nh.includes(f.n) || f.n.includes(nh)));
    }
    if (hit) { map[h] = hit.value; used.add(hit.value); }
    else map[h] = SKIP;
  }
  return map;
}

async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCsv(text);
  }
  // xlsx/xls
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? '').trim());
  });
  const rows: Record<string, string>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, idx) => {
      const v = r.getCell(idx + 1).value;
      const s = v == null ? '' : typeof v === 'object' && 'text' in (v as any) ? String((v as any).text) : String(v);
      obj[h] = s.trim();
      if (obj[h]) any = true;
    });
    if (any) rows.push(obj);
  }
  return { headers, rows };
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); lines.push(cur); }
  const headers = (lines.shift() ?? []).map(h => h.trim());
  const rows = lines
    .filter(l => l.some(v => v && v.trim()))
    .map(l => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { o[h] = (l[i] ?? '').trim(); });
      return o;
    });
  return { headers, rows };
}

export function ImportCrmCompaniesModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; failed: number; errors: string[] }>({ created: 0, failed: 0, errors: [] });
  const [parsing, setParsing] = useState(false);

  const mappedTargets = useMemo(() => new Set(Object.values(mapping).filter(v => v !== SKIP)), [mapping]);
  const hasName = mappedTargets.has('name');

  const reset = () => {
    setStep('upload');
    setFileName(''); setHeaders([]); setRows([]); setMapping({});
    setProgress(0); setResult({ created: 0, failed: 0, errors: [] });
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const { headers, rows } = await parseFile(file);
      if (!headers.length || !rows.length) {
        toast.error('No data found in file');
        return;
      }
      setFileName(file.name);
      setHeaders(headers);
      setRows(rows);
      setMapping(autoMap(headers));
      setStep('map');
    } catch (e: any) {
      toast.error('Failed to parse file', { description: e.message });
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    if (!company?.id) { toast.error('No active workspace'); return; }
    setStep('importing');
    let created = 0, failed = 0; const errors: string[] = [];
    const batchSize = 50;
    const records = rows.map(r => {
      const out: any = {};
      for (const [src, tgt] of Object.entries(mapping)) {
        if (tgt === SKIP) continue;
        const v = r[src];
        if (v == null || v === '') continue;
        if (tgt === 'employee_count') {
          const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
          if (!isNaN(n)) out[tgt] = n;
        } else {
          out[tgt] = v;
        }
      }
      return out;
    }).filter(r => r.name && String(r.name).trim());

    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize).map(r => ({
        ...r,
        created_by: user?.id,
        org_company_id: company.id,
      }));
      const { data, error } = await supabase.from('crm_companies').insert(chunk as any).select('id');
      if (error) {
        // Fallback: try one-by-one to maximize successful imports
        for (const row of chunk) {
          const { error: e2 } = await supabase.from('crm_companies').insert(row as any);
          if (e2) { failed++; if (errors.length < 5) errors.push(`${row.name}: ${e2.message}`); }
          else created++;
        }
      } else {
        created += data?.length ?? chunk.length;
      }
      setProgress(Math.min(100, Math.round(((i + chunk.length) / records.length) * 100)));
    }

    setResult({ created, failed, errors });
    setStep('done');
    queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
    if (created) toast.success(`Imported ${created} companies`);
    if (failed) toast.error(`${failed} rows failed`);
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Companies</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file and map columns to CRM company fields.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <label
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-muted/40 transition"
            >
              {parsing ? (
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-sm font-medium">{parsing ? 'Parsing…' : 'Click to upload CSV or Excel'}</div>
              <div className="text-xs text-muted-foreground">.csv, .xlsx, .xls — first row should be headers</div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={parsing}
              />
            </label>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium text-foreground">{fileName}</span>
              <span>· {rows.length} rows · {headers.length} columns</span>
            </div>

            {!hasName && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                You must map at least one column to <strong>Company Name</strong> to import.
              </div>
            )}

            <div className="border rounded-lg divide-y">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                <div>Source Column</div>
                <div>→</div>
                <div>CRM Field</div>
              </div>
              {headers.map(h => {
                const sample = rows.slice(0, 3).map(r => r[h]).filter(Boolean)[0];
                return (
                  <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{h || <span className="text-muted-foreground italic">(blank)</span>}</div>
                      {sample && <div className="text-[11px] text-muted-foreground truncate">e.g. {sample}</div>}
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <div>
                      <Select value={mapping[h] ?? SKIP} onValueChange={v => setMapping(p => ({ ...p, [h]: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>— Skip —</SelectItem>
                          {TARGET_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value} disabled={mappedTargets.has(f.value) && mapping[h] !== f.value}>
                              {f.label}{f.required ? ' *' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-10 space-y-4 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            <div className="text-sm">Importing companies… {progress}%</div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="py-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <div className="text-base font-medium">Import complete</div>
            <div className="text-sm text-muted-foreground">
              {result.created} created · {result.failed} failed
            </div>
            {result.errors.length > 0 && (
              <div className="text-left text-xs bg-muted/40 rounded p-3 space-y-1">
                {result.errors.map((e, i) => <div key={i} className="text-destructive">{e}</div>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={runImport} disabled={!hasName}>Import {rows.length} rows</Button>
            </>
          )}
          {(step === 'upload' || step === 'done') && (
            <Button variant="outline" onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
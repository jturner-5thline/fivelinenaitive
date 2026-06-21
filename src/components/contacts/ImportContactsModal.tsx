import { useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void }

// Special marker for a free-text "Company Name" mapping; we resolve/create a
// crm_companies row and link via crm_company_id.
const COMPANY_NAME_KEY = '__company_name__';

const TARGET_FIELDS: { value: string; label: string; required?: boolean }[] = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email', required: true },
  { value: 'city', label: 'City' },
  { value: 'lead_status', label: 'Lead Status' },
  { value: 'contact_type', label: 'Contact Type' },
  { value: 'created_at', label: 'Create Date' },
  { value: 'last_contacted_date', label: 'Last Contacted' },
  { value: 'industry', label: 'Industry' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'opted_out_one_to_one', label: 'Opted out of email: One to One' },
  { value: 'email_domain_normalized', label: 'Email Domain' },
  { value: 'state_region', label: 'State/Region' },
  { value: COMPANY_NAME_KEY, label: 'Company Name' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'phone_work', label: 'Phone Number' },
  { value: 'phone_mobile', label: 'Mobile Phone Number' },
];

const SKIP = '__skip__';

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  const norms = TARGET_FIELDS.map(f => ({ ...f, n: normalize(f.value), nl: normalize(f.label) }));
  const aliases: Record<string, string> = {
    firstname: 'first_name', givenname: 'first_name',
    lastname: 'last_name', surname: 'last_name', familyname: 'last_name',
    fullname: 'first_name',
    emailaddress: 'email', emails: 'email', primaryemail: 'email',
    leadstatus: 'lead_status', status: 'lead_status',
    contacttype: 'contact_type', type: 'contact_type',
    createdate: 'created_at', createddate: 'created_at', createdat: 'created_at', datecreated: 'created_at', created: 'created_at',
    lastcontacted: 'last_contacted_date', lastcontact: 'last_contacted_date', lastcontactdate: 'last_contacted_date',
    industry: 'industry', sector: 'industry',
    jobtitle: 'job_title', title: 'job_title', role: 'job_title', position: 'job_title',
    optedoutofemailonetoone: 'opted_out_one_to_one', optedout: 'opted_out_one_to_one',
    unsubscribed: 'opted_out_one_to_one', emailoptout: 'opted_out_one_to_one',
    emaildomain: 'email_domain_normalized', domain: 'email_domain_normalized',
    state: 'state_region', region: 'state_region', stateregion: 'state_region', province: 'state_region',
    companyname: COMPANY_NAME_KEY, company: COMPANY_NAME_KEY, accountname: COMPANY_NAME_KEY, account: COMPANY_NAME_KEY, organization: COMPANY_NAME_KEY, employer: COMPANY_NAME_KEY,
    linkedin: 'linkedin_url', linkedinurl: 'linkedin_url', linkedinprofile: 'linkedin_url',
    phone: 'phone_work', phonenumber: 'phone_work', workphone: 'phone_work', officephone: 'phone_work', tel: 'phone_work',
    mobile: 'phone_mobile', mobilephone: 'phone_mobile', mobilephonenumber: 'phone_mobile', cell: 'phone_mobile', cellphone: 'phone_mobile',
    city: 'city', town: 'city',
  };
  for (const h of headers) {
    const nh = normalize(h);
    if (!nh) { map[h] = SKIP; continue; }
    let hit = norms.find(f => !used.has(f.value) && (f.n === nh || f.nl === nh));
    if (!hit) {
      const t = aliases[nh];
      if (t) hit = norms.find(f => f.value === t && !used.has(f.value));
    }
    if (!hit) hit = norms.find(f => !used.has(f.value) && (nh.includes(f.n) || f.n.includes(nh)));
    if (hit) { map[h] = hit.value; used.add(hit.value); }
    else map[h] = SKIP;
  }
  return map;
}

async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const text = await file.text();
    // Auto-detect delimiter from the header row: tab > semicolon > comma
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    return parseDelimited(text, delim);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => headers.push(String(cell.value ?? '').trim()));
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

function parseDelimited(text: string, delim: string = ','): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let cur: string[] = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); lines.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); lines.push(cur); }
  const headers = (lines.shift() ?? []).map(h => h.trim());
  const rows = lines.filter(l => l.some(v => v && v.trim())).map(l => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (l[i] ?? '').trim(); });
    return o;
  });
  return { headers, rows };
}

function parseBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'opted out', 'unsubscribed'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'opted in', 'subscribed'].includes(s)) return false;
  return undefined;
}

export function ImportContactsModal({ open, onClose }: Props) {
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
  const hasEmail = mappedTargets.has('email');

  // Find which source column maps to email, then count how many rows actually have an email value.
  const emailSourceCol = useMemo(() => {
    for (const [src, tgt] of Object.entries(mapping)) if (tgt === 'email') return src;
    return null;
  }, [mapping]);
  const rowsWithEmail = useMemo(() => {
    if (!emailSourceCol) return 0;
    return rows.reduce((n, r) => (r[emailSourceCol]?.trim() ? n + 1 : n), 0);
  }, [rows, emailSourceCol]);

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setRows([]); setMapping({});
    setProgress(0); setResult({ created: 0, failed: 0, errors: [] });
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const { headers, rows } = await parseFile(file);
      if (!headers.length || !rows.length) { toast.error('No data found in file'); return; }
      setFileName(file.name); setHeaders(headers); setRows(rows); setMapping(autoMap(headers));
      setStep('map');
    } catch (e: any) {
      toast.error('Failed to parse file', { description: e.message });
    } finally { setParsing(false); }
  };

  // Resolve a company name to crm_company_id. Cache lookups and create if missing.
  const companyCache = new Map<string, string>();
  const resolveCompany = async (rawName: string): Promise<string | undefined> => {
    const name = rawName.trim();
    if (!name || !company?.id) return undefined;
    const key = name.toLowerCase();
    if (companyCache.has(key)) return companyCache.get(key);
    const { data: existing } = await supabase
      .from('crm_companies')
      .select('id')
      .eq('org_company_id', company.id)
      .ilike('name', name)
      .limit(1);
    if (existing && existing[0]) { companyCache.set(key, existing[0].id); return existing[0].id; }
    const { data: created, error } = await supabase
      .from('crm_companies')
      .insert({ name, org_company_id: company.id, created_by: user?.id } as any)
      .select('id')
      .single();
    if (error || !created) return undefined;
    companyCache.set(key, created.id);
    return created.id;
  };

  const runImport = async () => {
    if (!company?.id) { toast.error('No active workspace'); return; }
    setStep('importing');
    let created = 0, failed = 0; const errors: string[] = [];

    const records: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const out: any = {};
      for (const [src, tgt] of Object.entries(mapping)) {
        if (tgt === SKIP) continue;
        const v = r[src];
        if (v == null || v === '') continue;
        if (tgt === COMPANY_NAME_KEY) {
          const cid = await resolveCompany(v);
          if (cid) out.crm_company_id = cid;
        } else if (tgt === 'created_at' || tgt === 'last_contacted_date') {
          const d = new Date(String(v));
          if (!isNaN(d.getTime())) out[tgt] = d.toISOString();
        } else if (tgt === 'opted_out_one_to_one') {
          const b = parseBool(String(v));
          if (b !== undefined) out[tgt] = b;
        } else {
          out[tgt] = v;
        }
      }
      if (out.email) records.push(out);
      setProgress(Math.min(50, Math.round((i / rows.length) * 50)));
    }

    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize).map(r => ({
        ...r,
        full_name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || undefined,
        created_by: user?.id,
        org_company_id: company.id,
      }));
      const { data, error } = await supabase.from('contacts').insert(chunk as any).select('id');
      if (error) {
        for (const row of chunk) {
          const { error: e2 } = await supabase.from('contacts').insert(row as any);
          if (e2) { failed++; if (errors.length < 5) errors.push(`${row.email}: ${e2.message}`); }
          else created++;
        }
      } else {
        created += data?.length ?? chunk.length;
      }
      setProgress(50 + Math.min(50, Math.round(((i + chunk.length) / records.length) * 50)));
    }

    setResult({ created, failed, errors });
    setStep('done');
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    if (created) toast.success(`Imported ${created} contacts`);
    if (failed) toast.error(`${failed} rows failed`, { description: errors[0] });
    if (!created && !failed) {
      toast.error('No rows imported — make sure the "Email" column is mapped and rows have values');
    }
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file and map columns to contact fields.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-muted/40 transition">
              {parsing ? <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              <div className="text-sm font-medium">{parsing ? 'Parsing…' : 'Click to upload CSV or Excel'}</div>
              <div className="text-xs text-muted-foreground">.csv, .xlsx, .xls — first row should be headers</div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
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

            {!hasEmail && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                You must map at least one column to <strong>Email</strong> to import.
              </div>
            )}
            {hasEmail && (
              <div className={`rounded-md border p-3 text-xs ${rowsWithEmail === 0 ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted/40 text-muted-foreground'}`}>
                <strong>{rowsWithEmail}</strong> of {rows.length} rows have a value in the mapped Email column and will be imported.
                {rowsWithEmail === 0 && ' Check that you mapped the correct column — rows without an email are skipped.'}
              </div>
            )}

            <div className="border rounded-lg divide-y">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                <div>Source Column</div><div>→</div><div>Contact Field</div>
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
            <div className="text-sm">Importing contacts… {progress}%</div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="py-6 space-y-3 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <div className="text-base font-medium">Import complete</div>
            <div className="text-sm text-muted-foreground">{result.created} created · {result.failed} failed</div>
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
              <Button onClick={runImport} disabled={!hasEmail || rowsWithEmail === 0}>
                Import {rowsWithEmail || rows.length} rows
              </Button>
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
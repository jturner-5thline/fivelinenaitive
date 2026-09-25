// Generic CSV template / export / import helpers shared by Deals, Contacts and Companies.
// The export headers ARE the import template, so exported files round-trip with no mapping.
import { parseCsv, downloadCsv } from '@/utils/lenderCsv';

export { parseCsv, downloadCsv };

export type CsvFieldKind = 'text' | 'number' | 'integer' | 'array' | 'boolean' | 'date';

export interface CsvField {
  key: string;
  header: string;
  kind: CsvFieldKind;
  aliases?: string[];
  example?: string;
  /** Exported but never written on import (e.g. Record ID, Created). */
  readOnly?: boolean;
}

export interface CsvSchema {
  fields: CsvField[];
  /** Field key that must be mapped for a row to be importable. */
  requiredKey: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function autoMapHeaders(schema: CsvSchema, headers: string[]): Record<number, string | null> {
  const idx = new Map<string, string>();
  for (const f of schema.fields) idx.set(norm(f.header), f.key);
  for (const f of schema.fields) {
    for (const a of [f.key.replace(/_/g, ' '), ...(f.aliases ?? [])]) {
      const n = norm(a);
      if (!idx.has(n)) idx.set(n, f.key);
    }
  }
  const out: Record<number, string | null> = {};
  const used = new Set<string>();
  headers.forEach((h, i) => {
    const k = idx.get(norm(h)) ?? null;
    out[i] = k && !used.has(k) ? k : null;
    if (k) used.add(k);
  });
  return out;
}

export function isStandardTemplate(schema: CsvSchema, headers: string[]): boolean {
  const canon = new Set(schema.fields.map(f => norm(f.header)));
  const req = schema.fields.find(f => f.key === schema.requiredKey)!;
  const used = headers.filter(h => h.trim());
  return used.length > 0 && used.every(h => canon.has(norm(h))) && used.some(h => norm(h) === norm(req.header));
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportToCsv(schema: CsvSchema, rows: Record<string, any>[]): string {
  const header = schema.fields.map(f => cell(f.header)).join(',');
  const body = rows.map(r => schema.fields.map(f => cell(r[f.key])).join(','));
  return '\uFEFF' + [header, ...body].join('\r\n');
}

export function buildTemplateCsv(schema: CsvSchema): string {
  const header = schema.fields.map(f => cell(f.header)).join(',');
  const example = schema.fields.map(f => cell(f.readOnly ? '' : f.example ?? '')).join(',');
  return '\uFEFF' + [header, example].join('\r\n');
}

function toNumber(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)(k|m|mm|b)?%?$/);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' || m[2] === 'mm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  return Number(m[1]) * mult;
}

export function rowToRecord(schema: CsvSchema, row: string[], mapping: Record<number, string | null>): Record<string, any> {
  const out: Record<string, any> = {};
  Object.entries(mapping).forEach(([i, key]) => {
    if (!key) return;
    const f = schema.fields.find(x => x.key === key);
    const raw = (row[Number(i)] ?? '').trim();
    if (!f || f.readOnly || !raw) return;
    switch (f.kind) {
      case 'number': { const n = toNumber(raw); if (n !== null) out[key] = n; break; }
      case 'integer': { const n = toNumber(raw); if (n !== null) out[key] = Math.round(n); break; }
      case 'array': { const a = raw.split(/[;,\n]/).map(s => s.trim()).filter(Boolean); if (a.length) out[key] = a; break; }
      case 'boolean': out[key] = /^(true|yes|y|1)$/i.test(raw); break;
      case 'date': { const d = new Date(raw); if (!isNaN(d.getTime())) out[key] = d.toISOString().slice(0, 10); break; }
      default: out[key] = raw;
    }
  });
  return out;
}

/** Reads a CSV or Excel file into a header row + data rows. */
export async function readTableFile(file: File): Promise<string[][]> {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    return (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as any[][])
      .map(r => r.map(v => String(v ?? ''))).filter(r => r.some(v => v.trim()));
  }
  return parseCsv(await file.text());
}

export const normKey = (s: unknown) => String(s ?? '').trim().toLowerCase();
export const normDomain = (s: unknown) =>
  normKey(s).replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];

import { useState, useMemo, useEffect } from 'react';
import {
  Users, Merge, Check, AlertTriangle, Globe, MapPin, Building2, Phone,
  Mail, User, Tag, Search, ChevronRight, X, Clock, Sparkles, ShieldAlert,
  CircleDot, Layers, ArrowRight, Filter as FilterIcon, FileText, ClipboardList,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { detectDuplicateLenders } from '@/lib/lenderDuplicates';
import { cn } from '@/lib/utils';

interface DuplicateLendersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
  onMergeLenders: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  onDeleteLender: (id: string) => Promise<void>;
}

interface DupGroup {
  id: string;
  primaryName: string;
  lenders: MasterLender[];
}

// ── Field schema ────────────────────────────────────────────────────────────
type FieldType = 'text' | 'number' | 'currency' | 'longtext' | 'boolish' | 'array' | 'date' | 'url';
interface FieldDef {
  key: keyof MasterLender;
  label: string;
  type: FieldType;
  section: 'identity' | 'commercial' | 'relationship' | 'process' | 'documents' | 'system';
  conflictWeight?: 'high' | 'med' | 'low';
}
const FIELDS: FieldDef[] = [
  // Identity
  { key: 'name', label: 'Legal / Display Name', type: 'text', section: 'identity', conflictWeight: 'high' },
  { key: 'website', label: 'Website', type: 'text', section: 'identity', conflictWeight: 'high' },
  { key: 'linkedin_url', label: 'LinkedIn URL', type: 'text', section: 'identity' },
  { key: 'address', label: 'Address', type: 'text', section: 'identity' },
  { key: 'geo', label: 'HQ / Geography', type: 'text', section: 'identity', conflictWeight: 'med' },
  { key: 'flex_lender_id', label: 'External ID (FLEx)', type: 'text', section: 'identity', conflictWeight: 'high' },
  { key: 'external_created_by', label: 'External Created By', type: 'text', section: 'identity' },
  { key: 'created_at', label: 'Created', type: 'date', section: 'identity' },
  { key: 'updated_at', label: 'Last Updated', type: 'date', section: 'identity' },
  { key: 'external_last_modified', label: 'External Last Modified', type: 'date', section: 'identity' },
  // Commercial
  { key: 'lender_type', label: 'Funding Source', type: 'text', section: 'commercial', conflictWeight: 'med' },
  { key: 'tier', label: 'Tier', type: 'text', section: 'commercial', conflictWeight: 'med' },
  { key: 'active', label: 'Active', type: 'boolish', section: 'commercial' },
  { key: 'min_deal', label: 'Min Deal Size', type: 'currency', section: 'commercial' },
  { key: 'max_deal', label: 'Max Deal Size', type: 'currency', section: 'commercial' },
  { key: 'min_revenue', label: 'Min Revenue', type: 'currency', section: 'commercial' },
  { key: 'ebitda_min', label: 'Min EBITDA', type: 'currency', section: 'commercial' },
  { key: 'loan_types', label: 'Loan Products', type: 'array', section: 'commercial' },
  { key: 'industries', label: 'Industries Covered', type: 'array', section: 'commercial' },
  { key: 'industries_to_avoid', label: 'Industries To Avoid', type: 'array', section: 'commercial' },
  { key: 'b2b_b2c', label: 'B2B / B2C', type: 'text', section: 'commercial' },
  { key: 'refinancing', label: 'Refinancing', type: 'text', section: 'commercial' },
  { key: 'sub_debt', label: 'Sub Debt', type: 'text', section: 'commercial' },
  { key: 'cash_burn', label: 'Cash Burn', type: 'text', section: 'commercial' },
  { key: 'sponsorship', label: 'Sponsorship', type: 'text', section: 'commercial' },
  { key: 'company_requirements', label: 'Company Requirements', type: 'longtext', section: 'commercial', conflictWeight: 'med' },
  { key: 'deal_structure_notes', label: 'Deal Structure(s)', type: 'longtext', section: 'commercial', conflictWeight: 'med' },
  { key: 'tags', label: 'Tags', type: 'array', section: 'commercial' },
  { key: 'funding_source_notes', label: 'Funding Source Notes', type: 'longtext', section: 'commercial' },
  { key: 'about_notes', label: 'About / Notes', type: 'longtext', section: 'commercial' },
  // Relationship
  { key: 'contact_name', label: 'Primary Contact', type: 'text', section: 'relationship', conflictWeight: 'med' },
  { key: 'contact_title', label: 'Contact Title', type: 'text', section: 'relationship' },
  { key: 'email', label: 'Email', type: 'text', section: 'relationship', conflictWeight: 'high' },
  { key: 'contact_phone', label: 'Contact Phone', type: 'text', section: 'relationship' },
  { key: 'phone', label: 'Org Phone', type: 'text', section: 'relationship' },
  { key: 'relationship_owners', label: 'Relationship Owner(s)', type: 'text', section: 'relationship', conflictWeight: 'med' },
  { key: 'referral_lender', label: 'Referral Source', type: 'text', section: 'relationship' },
  { key: 'referral_fee_offered', label: 'Referral Fee', type: 'text', section: 'relationship', conflictWeight: 'med' },
  { key: 'nda', label: 'NDA', type: 'text', section: 'relationship', conflictWeight: 'med' },
  { key: 'gift_address', label: 'Gift Address', type: 'text', section: 'relationship' },
  // Process / checklists
  { key: 'upfront_checklist', label: 'BU / Upfront Checklist', type: 'longtext', section: 'process', conflictWeight: 'med' },
  { key: 'post_term_sheet_checklist', label: 'Post-Term Sheet Checklist', type: 'longtext', section: 'process', conflictWeight: 'med' },
  { key: 'onboarded_to_flex', label: 'Onboarded to FLEx', type: 'text', section: 'process', conflictWeight: 'med' },
  // Documents / attachments (URL-backed)
  { key: 'lender_one_pager_url', label: 'Lender One-Pager', type: 'url', section: 'documents' },
  { key: 'referral_agreement', label: 'Referral Agreement / NDA', type: 'url', section: 'documents', conflictWeight: 'med' },
  // System / sync
  { key: 'sync_source', label: 'Sync Source', type: 'text', section: 'system' },
  { key: 'last_synced_from_flex', label: 'Last FLEx Sync', type: 'date', section: 'system' },
];

const SECTION_META: Record<string, { label: string; icon: any }> = {
  identity: { label: 'Identity', icon: Building2 },
  commercial: { label: 'Commercial Profile', icon: Layers },
  relationship: { label: 'Relationship & Operations', icon: User },
  process: { label: 'Checklists & Process', icon: ClipboardList },
  documents: { label: 'Documents & Attachments', icon: FileText },
  system: { label: 'System / Sync', icon: Clock },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function isEmpty(v: any): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
function formatCurrency(v: any): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}MM`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
function formatDate(v: any): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString(); } catch { return String(v); }
}
function formatBool(v: any): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}
function displayValue(field: FieldDef, v: any): string {
  if (isEmpty(v)) return '—';
  switch (field.type) {
    case 'currency': return formatCurrency(v);
    case 'date': return formatDate(v);
    case 'boolish': return formatBool(v);
    case 'array': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'url': return String(v);
    default: return String(v);
  }
}
function normalizeForCompare(field: FieldDef, v: any): string {
  if (isEmpty(v)) return '';
  if (field.type === 'array') return [...(v as string[])].map(s => s.trim().toLowerCase()).sort().join('|');
  if (field.type === 'text' || field.type === 'longtext') return String(v).trim().toLowerCase();
  if (field.type === 'boolish') return v ? 'true' : 'false';
  return String(v);
}
function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = url.match(/^https?:/i) ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}
function completenessScore(l: MasterLender): number {
  let s = 0;
  for (const f of FIELDS) if (!isEmpty((l as any)[f.key])) s++;
  return s;
}
function autoWinner(field: FieldDef, lenders: MasterLender[]): string {
  // Prefer non-empty, then by completeness, then by most-recent updated_at.
  const nonEmpty = lenders.filter(l => !isEmpty((l as any)[field.key]));
  const pool = nonEmpty.length ? nonEmpty : lenders;
  let best = pool[0];
  let bestScore = -Infinity;
  for (const l of pool) {
    const compl = completenessScore(l);
    const recency = new Date(l.updated_at).getTime() / 1e10;
    const domainBoost = field.key === 'website' && extractDomain(l.website) ? 5 : 0;
    const score = compl + recency + domainBoost;
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return best.id;
}

interface Conflict {
  field: keyof MasterLender;
  label: string;
  severity: 'high' | 'med';
  detail: string;
}
function detectConflicts(lenders: MasterLender[]): Conflict[] {
  if (lenders.length < 2) return [];
  const out: Conflict[] = [];
  for (const f of FIELDS) {
    if (!f.conflictWeight) continue;
    const vals = lenders.map(l => normalizeForCompare(f, (l as any)[f.key])).filter(Boolean);
    const uniq = new Set(vals);
    if (uniq.size > 1) {
      out.push({
        field: f.key, label: f.label,
        severity: f.conflictWeight === 'high' ? 'high' : 'med',
        detail: `${uniq.size} distinct values across ${lenders.length} records`,
      });
    }
  }
  // Domain mismatch override on website
  const domains = new Set(lenders.map(l => extractDomain(l.website)).filter(Boolean) as string[]);
  if (domains.size > 1 && !out.find(c => c.field === 'website')) {
    out.push({ field: 'website', label: 'Website domain', severity: 'high', detail: `${domains.size} different domains` });
  }
  return out;
}

// ── Reason chips for a group ────────────────────────────────────────────────
function groupReasonChips(lenders: MasterLender[]): { label: string; tone: 'good' | 'warn' }[] {
  const chips: { label: string; tone: 'good' | 'warn' }[] = [];
  const names = new Set(lenders.map(l => l.name.trim().toLowerCase()).filter(Boolean));
  if (names.size === 1) chips.push({ label: 'Exact name', tone: 'good' });
  else chips.push({ label: 'Fuzzy name', tone: 'good' });
  const domains = new Set(lenders.map(l => extractDomain(l.website)).filter(Boolean) as string[]);
  if (domains.size === 1 && domains.size > 0) chips.push({ label: 'Same domain', tone: 'good' });
  if (domains.size > 1) chips.push({ label: 'Different domains', tone: 'warn' });
  const emails = new Set(lenders.map(l => (l.email || '').trim().toLowerCase()).filter(Boolean));
  if (emails.size === 1 && emails.size > 0) chips.push({ label: 'Shared email', tone: 'good' });
  const flexIds = new Set(lenders.map(l => l.flex_lender_id).filter(Boolean) as string[]);
  if (flexIds.size > 1) chips.push({ label: 'Multiple external IDs', tone: 'warn' });
  return chips;
}

// ── Comparison row ──────────────────────────────────────────────────────────
function ScalarFieldRow({
  field, lenders, selectedId, customValue, onSelect, onCustom,
}: {
  field: FieldDef;
  lenders: MasterLender[];
  selectedId: string;
  customValue: string | null;
  onSelect: (id: string) => void;
  onCustom: (v: string | null) => void;
}) {
  const values = lenders.map(l => (l as any)[field.key]);
  const allEmpty = values.every(isEmpty);
  const normalized = values.map(v => normalizeForCompare(field, v));
  const uniq = new Set(normalized.filter(Boolean));
  const isConflict = uniq.size > 1;
  const isMatch = !isConflict && !allEmpty;
  const editable = field.type === 'text' || field.type === 'longtext';

  return (
    <div className={cn(
      'grid gap-2 px-3 py-2 border-b border-white/5 transition-colors',
      isConflict ? 'bg-amber-500/[0.04]' : 'opacity-90 hover:opacity-100',
    )}
      style={{ gridTemplateColumns: `180px repeat(${lenders.length}, minmax(0, 1fr))` }}
    >
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-medium text-foreground/90">{field.label}</span>
        {isConflict && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="h-3 w-3 text-amber-400" />
            </TooltipTrigger>
            <TooltipContent>Values differ between records</TooltipContent>
          </Tooltip>
        )}
      </div>
      {lenders.map(l => {
        const v = (l as any)[field.key];
        const empty = isEmpty(v);
        const selected = selectedId === l.id && customValue == null;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => { onSelect(l.id); onCustom(null); }}
            className={cn(
              'text-left text-xs px-2 py-1.5 rounded border transition-colors min-w-0',
              selected
                ? 'border-primary/60 bg-primary/15 text-foreground'
                : empty
                  ? 'border-white/5 text-muted-foreground/60 hover:border-white/10'
                  : isConflict
                    ? 'border-amber-500/20 hover:border-amber-500/40'
                    : 'border-white/5 hover:border-white/15',
            )}
            title={empty ? 'Empty' : displayValue(field, v)}
          >
            <div className="flex items-center gap-1.5">
              {selected && <Check className="h-3 w-3 text-primary shrink-0" />}
              <span className={cn('truncate', empty && 'italic')}>{displayValue(field, v)}</span>
            </div>
          </button>
        );
      })}
      {editable && (
        <div className="col-span-full pl-[180px] pt-1">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <input
                type="radio"
                className="accent-primary"
                checked={customValue != null}
                onChange={() => onCustom(customValue ?? '')}
              />
              Custom
            </label>
            {customValue != null && (
              <Input
                value={customValue}
                onChange={e => onCustom(e.target.value)}
                placeholder="Override value"
                className="h-7 text-xs bg-white/[0.03] border-white/10"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Array union editor ─────────────────────────────────────────────────────
function ArrayFieldRow({
  field, lenders, selected, onChange,
}: {
  field: FieldDef;
  lenders: MasterLender[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const all = useMemo(() => {
    const map = new Map<string, { value: string; sources: number[] }>();
    lenders.forEach((l, i) => {
      const arr = ((l as any)[field.key] as string[] | null) || [];
      for (const raw of arr) {
        const k = raw.trim();
        if (!k) continue;
        const key = k.toLowerCase();
        const cur = map.get(key) || { value: k, sources: [] };
        cur.sources.push(i);
        map.set(key, cur);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [field.key, lenders]);

  if (all.length === 0) {
    return (
      <div className="px-3 py-2 border-b border-white/5 text-xs text-muted-foreground/60">
        <span className="font-medium text-foreground/80 mr-2">{field.label}</span>—
      </div>
    );
  }

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(next);
  };

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground/90">{field.label}</span>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <button type="button" className="hover:text-foreground"
            onClick={() => onChange(new Set(all.map(([k]) => k)))}>Select all</button>
          <span>·</span>
          <button type="button" className="hover:text-foreground"
            onClick={() => onChange(new Set())}>Clear</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map(([key, info]) => {
          const isSelected = selected.has(key);
          const shared = info.sources.length === lenders.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                isSelected
                  ? 'border-primary/50 bg-primary/15 text-foreground'
                  : 'border-white/10 text-muted-foreground hover:border-white/25',
              )}
            >
              {isSelected ? <Check className="h-2.5 w-2.5" /> : <CircleDot className="h-2.5 w-2.5 opacity-50" />}
              <span>{info.value}</span>
              {!shared && (
                <span className="ml-0.5 text-[9px] uppercase tracking-wide text-amber-300/80">
                  {info.sources.length}/{lenders.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main workspace ──────────────────────────────────────────────────────────
function MergeWorkspace({
  group, onMerge, onMarkNotDuplicate, onSkip, isProcessing,
}: {
  group: DupGroup;
  onMerge: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  onMarkNotDuplicate: (group: DupGroup) => void;
  onSkip: () => void;
  isProcessing: boolean;
}) {
  // Candidate filtering / sorting (large groups)
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidateSort, setCandidateSort] = useState<'completeness' | 'updated' | 'name'>('completeness');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string>(group.lenders[0].id);

  // Reset on group change
  useEffect(() => {
    setExcluded(new Set());
    setPrimaryId(group.lenders[0].id);
    setCandidateQuery('');
    setScalarSel({});
    setCustomVals({});
    setArraySel({});
  }, [group.id]);

  const orderedCandidates = useMemo(() => {
    const arr = [...group.lenders];
    arr.sort((a, b) => {
      if (candidateSort === 'completeness') return completenessScore(b) - completenessScore(a);
      if (candidateSort === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return a.name.localeCompare(b.name);
    });
    // primary always first
    arr.sort((a, b) => (a.id === primaryId ? -1 : b.id === primaryId ? 1 : 0));
    return arr;
  }, [group.lenders, candidateSort, primaryId]);

  const visibleCandidates = useMemo(() => {
    const q = candidateQuery.trim().toLowerCase();
    return orderedCandidates.filter(l =>
      !q ||
      l.name.toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.contact_name || '').toLowerCase().includes(q) ||
      (l.website || '').toLowerCase().includes(q)
    );
  }, [orderedCandidates, candidateQuery]);

  const activeCandidates = visibleCandidates.filter(l => !excluded.has(l.id));
  const showCols = activeCandidates.length >= 2 ? activeCandidates : visibleCandidates.slice(0, Math.max(2, visibleCandidates.length));

  // Selections
  const [scalarSel, setScalarSel] = useState<Record<string, string>>({});
  const [customVals, setCustomVals] = useState<Record<string, string | null>>({});
  const [arraySel, setArraySel] = useState<Record<string, Set<string>>>({});

  // Init smart defaults whenever candidate set changes
  useEffect(() => {
    if (activeCandidates.length === 0) return;
    setScalarSel(prev => {
      const next = { ...prev };
      for (const f of FIELDS) {
        if (f.type === 'array') continue;
        if (!next[f.key as string] || !activeCandidates.find(l => l.id === next[f.key as string])) {
          next[f.key as string] = autoWinner(f, activeCandidates);
        }
      }
      return next;
    });
    setArraySel(prev => {
      const next = { ...prev };
      for (const f of FIELDS) {
        if (f.type !== 'array') continue;
        const k = f.key as string;
        if (!next[k]) {
          const union = new Set<string>();
          activeCandidates.forEach(l => {
            const arr = ((l as any)[f.key] as string[] | null) || [];
            arr.forEach(v => { const t = v.trim(); if (t) union.add(t.toLowerCase()); });
          });
          next[k] = union;
        }
      }
      return next;
    });
  }, [activeCandidates.map(l => l.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const conflicts = useMemo(() => detectConflicts(activeCandidates), [activeCandidates]);
  const unresolvedConflicts = conflicts.filter(c => {
    const sel = scalarSel[c.field as string];
    return !sel; // any conflict where no explicit selection has been made is treated as unresolved when severity=high
  });
  const highUnresolved = unresolvedConflicts.filter(c => c.severity === 'high');

  // Build merged record preview
  const mergedPreview = useMemo(() => {
    const out: Partial<MasterLenderInsert> & Record<string, any> = {};
    for (const f of FIELDS) {
      const k = f.key as string;
      if (f.type === 'array') {
        const sel = arraySel[k];
        if (!sel) continue;
        // reconstruct original-cased values from candidate arrays
        const caseMap = new Map<string, string>();
        activeCandidates.forEach(l => {
          const arr = ((l as any)[f.key] as string[] | null) || [];
          for (const v of arr) {
            const t = v.trim();
            if (t) caseMap.set(t.toLowerCase(), t);
          }
        });
        const arr = [...sel].map(key => caseMap.get(key) || key);
        (out as any)[k] = arr.length ? arr : null;
      } else {
        const custom = customVals[k];
        if (custom != null && custom !== '') {
          (out as any)[k] = custom;
          continue;
        }
        const id = scalarSel[k];
        const src = activeCandidates.find(l => l.id === id);
        if (src) (out as any)[k] = (src as any)[f.key] ?? null;
      }
    }
    return out;
  }, [scalarSel, customVals, arraySel, activeCandidates]);

  const resolvedFieldCount = useMemo(() => {
    let n = 0;
    for (const f of FIELDS) {
      const k = f.key as string;
      const v = (mergedPreview as any)[k];
      if (!isEmpty(v)) n++;
    }
    return n;
  }, [mergedPreview]);

  const handleMerge = async () => {
    if (activeCandidates.length < 2) {
      toast({ title: 'Need at least 2 records', variant: 'destructive' });
      return;
    }
    if (!activeCandidates.find(l => l.id === primaryId)) {
      toast({ title: 'Primary record must be included', variant: 'destructive' });
      return;
    }
    const mergeIds = activeCandidates.filter(l => l.id !== primaryId).map(l => l.id);
    // Strip server-only keys not in MasterLenderInsert
    const payload: any = { ...mergedPreview };
    delete payload.id; delete payload.user_id; delete payload.company_id;
    delete payload.created_at; delete payload.updated_at;
    delete payload.flex_lender_id; delete payload.last_synced_from_flex;
    await onMerge(primaryId, mergeIds, payload);
  };

  const sections: Array<keyof typeof SECTION_META> = [
    'identity', 'commercial', 'relationship', 'process', 'documents', 'system',
  ];
  const primary = activeCandidates.find(l => l.id === primaryId) || activeCandidates[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header strip */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold truncate">{group.primaryName}</h2>
          <Badge variant="outline" className="text-[10px] border-white/15">
            {group.lenders.length} candidates
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          {conflicts.length === 0 ? (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">
              <Check className="h-3 w-3 mr-1" /> No conflicts
            </Badge>
          ) : (
            <>
              {conflicts.filter(c => c.severity === 'high').length > 0 && (
                <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-300">
                  <ShieldAlert className="h-3 w-3 mr-1" />
                  {conflicts.filter(c => c.severity === 'high').length} high conflicts
                </Badge>
              )}
              {conflicts.filter(c => c.severity === 'med').length > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {conflicts.filter(c => c.severity === 'med').length} medium
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conflict summary chips */}
      {conflicts.length > 0 && (
        <div className="px-4 py-2 border-b border-white/8 flex flex-wrap gap-1.5">
          {conflicts.map(c => (
            <span key={c.field as string}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                c.severity === 'high'
                  ? 'border-rose-500/30 text-rose-200 bg-rose-500/[0.05]'
                  : 'border-amber-500/30 text-amber-200 bg-amber-500/[0.05]',
              )}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {c.label}: {c.detail}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-0">
        {/* Center: comparison grid */}
        <div className="col-span-9 min-h-0 flex flex-col border-r border-white/8">
          {/* Candidate toolbar */}
          <div className="px-3 py-2 border-b border-white/8 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={candidateQuery}
                onChange={e => setCandidateQuery(e.target.value)}
                placeholder="Filter candidates"
                className="pl-7 h-7 text-xs bg-white/[0.03] border-white/10"
              />
            </div>
            <Select value={candidateSort} onValueChange={v => setCandidateSort(v as any)}>
              <SelectTrigger className="h-7 w-[170px] text-xs bg-white/[0.03] border-white/10">
                <FilterIcon className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completeness">Most complete</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground">
              {activeCandidates.length} of {group.lenders.length} active
            </span>
          </div>

          {/* Sticky column headers */}
          <div
            className="sticky top-0 z-10 grid gap-2 px-3 py-2 border-b border-white/10 bg-background/40 backdrop-blur"
            style={{ gridTemplateColumns: `180px repeat(${showCols.length}, minmax(0, 1fr))` }}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Field</div>
            {showCols.map(l => {
              const excludedFlag = excluded.has(l.id);
              return (
                <div key={l.id} className={cn(
                  'rounded border px-2 py-1.5 transition-colors',
                  l.id === primaryId
                    ? 'border-primary/50 bg-primary/10'
                    : excludedFlag
                      ? 'border-white/5 opacity-50'
                      : 'border-white/10 bg-white/[0.02]',
                )}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium truncate" title={l.name}>{l.name}</span>
                    {l.id === primaryId && <Badge variant="outline" className="h-4 text-[9px] border-primary/40 text-primary">Primary</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span title="Completeness">{completenessScore(l)}/{FIELDS.length}</span>
                    <span>·</span>
                    <span>{formatDate(l.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {l.id !== primaryId && (
                      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]"
                        onClick={() => setPrimaryId(l.id)}>
                        Make primary
                      </Button>
                    )}
                    <Button size="sm" variant="ghost"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        const next = new Set(excluded);
                        if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                        setExcluded(next);
                        if (l.id === primaryId) {
                          const fallback = group.lenders.find(x => x.id !== l.id);
                          if (fallback) setPrimaryId(fallback.id);
                        }
                      }}>
                      {excludedFlag ? 'Include' : 'Exclude'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Field rows grouped by section */}
          <ScrollArea className="flex-1 min-h-0">
            {sections.map(section => {
              const SectionIcon = SECTION_META[section].icon;
              const fieldsInSection = FIELDS.filter(f => f.section === section);
              return (
                <div key={section}>
                  <div className="sticky top-0 z-[5] flex items-center gap-2 px-3 py-1.5 bg-background/60 backdrop-blur border-b border-white/8">
                    <SectionIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {SECTION_META[section].label}
                    </span>
                  </div>
                  {fieldsInSection.map(f => {
                    if (f.type === 'array') {
                      return (
                        <ArrayFieldRow
                          key={f.key as string}
                          field={f}
                          lenders={activeCandidates}
                          selected={arraySel[f.key as string] || new Set()}
                          onChange={s => setArraySel(prev => ({ ...prev, [f.key as string]: s }))}
                        />
                      );
                    }
                    return (
                      <ScalarFieldRow
                        key={f.key as string}
                        field={f}
                        lenders={showCols}
                        selectedId={scalarSel[f.key as string] || ''}
                        customValue={customVals[f.key as string] ?? null}
                        onSelect={id => setScalarSel(prev => ({ ...prev, [f.key as string]: id }))}
                        onCustom={v => setCustomVals(prev => ({ ...prev, [f.key as string]: v }))}
                      />
                    );
                  })}
                </div>
              );
            })}
          </ScrollArea>
        </div>

        {/* Right rail: merged preview */}
        <div className="col-span-3 min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b border-white/8 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold">Merged record preview</span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-3">
              <div className="rounded border border-white/10 bg-white/[0.02] p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Primary survivor</div>
                <div className="text-sm font-semibold truncate mt-0.5">{primary?.name || '—'}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Archives {activeCandidates.length - 1} record{activeCandidates.length - 1 === 1 ? '' : 's'}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-white/10 p-2">
                  <div className="text-sm font-semibold">{resolvedFieldCount}</div>
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Filled</div>
                </div>
                <div className="rounded border border-white/10 p-2">
                  <div className="text-sm font-semibold text-amber-300">{conflicts.length}</div>
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Conflicts</div>
                </div>
                <div className="rounded border border-white/10 p-2">
                  <div className="text-sm font-semibold">{activeCandidates.length}</div>
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Merging</div>
                </div>
              </div>

              <Separator className="bg-white/10" />

              {/* Key merged values */}
              <div className="space-y-1.5 text-xs">
                {([
                  ['name', 'Name', User],
                  ['website', 'Website', Globe],
                  ['geo', 'Geography', MapPin],
                  ['lender_type', 'Type', Tag],
                  ['email', 'Email', Mail],
                  ['contact_name', 'Contact', User],
                  ['contact_phone', 'Phone', Phone],
                ] as const).map(([k, label, Icon]) => {
                  const v = (mergedPreview as any)[k];
                  return (
                    <div key={k} className="flex items-start gap-2">
                      <Icon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="truncate">{isEmpty(v) ? <span className="text-muted-foreground/60 italic">—</span> : String(v)}</div>
                      </div>
                    </div>
                  );
                })}

                {(['loan_types', 'industries'] as const).map(k => {
                  const v = (mergedPreview as any)[k] as string[] | null;
                  return (
                    <div key={k} className="pt-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        {k === 'loan_types' ? 'Loan products' : 'Industries'} ({v?.length || 0})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(v || []).slice(0, 8).map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-white/10">{t}</span>
                        ))}
                        {(v?.length || 0) > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{(v?.length || 0) - 8} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          {/* Sticky action footer */}
          <div className="border-t border-white/8 p-3 space-y-2">
            {highUnresolved.length > 0 && (
              <div className="text-[10px] text-rose-300 flex items-start gap-1.5">
                <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
                Resolve high-severity conflicts before merging.
              </div>
            )}
            <Button
              className="w-full gap-2"
              disabled={isProcessing || activeCandidates.length < 2 || highUnresolved.length > 0}
              onClick={handleMerge}
            >
              <Merge className="h-3.5 w-3.5" />
              Merge {activeCandidates.length} records
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => onMarkNotDuplicate(group)}>
                Not duplicates
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={onSkip}>
                Skip for now
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground text-center">
              Merge is auditable and cannot be undone in-place. Archived records are removed from the directory.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Group queue (left rail of outer shell) ──────────────────────────────────
function GroupQueue({
  groups, activeId, onSelect, skippedIds,
}: {
  groups: DupGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
  skippedIds: Set<string>;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'conflicts'>('all');

  const enriched = useMemo(() => groups.map(g => ({
    g,
    chips: groupReasonChips(g.lenders),
    conflicts: detectConflicts(g.lenders),
  })), [groups]);

  const filtered = enriched.filter(({ g, conflicts }) => {
    if (skippedIds.has(g.id)) return false;
    if (filter === 'conflicts' && conflicts.length === 0) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return g.primaryName.toLowerCase().includes(s) ||
      g.lenders.some(l => l.name.toLowerCase().includes(s) || (l.email || '').toLowerCase().includes(s));
  });

  return (
    <div className="flex flex-col h-full min-h-0 border-r border-white/8">
      <div className="px-3 py-2 border-b border-white/8 space-y-1.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Duplicate groups</span>
          <Badge variant="outline" className="ml-auto text-[10px] border-white/15">{filtered.length}</Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search groups"
            className="pl-7 h-7 text-xs bg-white/[0.03] border-white/10"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'conflicts'] as const).map(k => (
            <button key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border',
                filter === k
                  ? 'border-primary/50 bg-primary/15 text-foreground'
                  : 'border-white/10 text-muted-foreground hover:border-white/25',
              )}>
              {k === 'all' ? 'All' : 'Conflicts'}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1.5">
          {filtered.length === 0 && (
            <div className="text-[11px] text-muted-foreground text-center py-8">
              No groups match.
            </div>
          )}
          {filtered.map(({ g, chips, conflicts }) => {
            const active = g.id === activeId;
            const high = conflicts.filter(c => c.severity === 'high').length;
            return (
              <button
                key={g.id}
                onClick={() => onSelect(g.id)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded border transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-white/8 hover:border-white/20 hover:bg-white/[0.02]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate flex-1">{g.primaryName}</span>
                  <Badge variant="outline" className="h-4 text-[9px] border-white/15">{g.lenders.length}</Badge>
                  {active && <ChevronRight className="h-3 w-3 text-primary" />}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {chips.slice(0, 3).map(c => (
                    <span key={c.label}
                      className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full border',
                        c.tone === 'warn'
                          ? 'border-amber-500/30 text-amber-200'
                          : 'border-white/10 text-muted-foreground',
                      )}>
                      {c.label}
                    </span>
                  ))}
                  {high > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-rose-500/30 text-rose-200">
                      {high} risk
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Top-level dialog ────────────────────────────────────────────────────────
export function DuplicateLendersDialog({
  open, onOpenChange, lenders, onMergeLenders, onDeleteLender,
}: DuplicateLendersDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [notDupConfirm, setNotDupConfirm] = useState<DupGroup | null>(null);

  // Reuse sophisticated detector for grouping
  const groups: DupGroup[] = useMemo(() => {
    const { groups } = detectDuplicateLenders(
      lenders.map(l => ({ id: l.id, name: l.name || '' }))
    );
    const byId = new Map(lenders.map(l => [l.id, l]));
    return groups
      .map(g => {
        const ls = g.memberIds.map(id => byId.get(id)).filter(Boolean) as MasterLender[];
        ls.sort((a, b) => completenessScore(b) - completenessScore(a));
        return {
          id: g.groupId,
          primaryName: ls[0]?.name || g.groupId,
          lenders: ls,
        };
      })
      .filter(g => g.lenders.length > 1)
      .sort((a, b) => b.lenders.length - a.lenders.length);
  }, [lenders]);

  // Pick first group when opening / when current is gone
  useEffect(() => {
    if (!open) return;
    if (!activeGroupId || !groups.find(g => g.id === activeGroupId)) {
      const first = groups.find(g => !skippedIds.has(g.id));
      setActiveGroupId(first?.id || null);
    }
  }, [open, groups, activeGroupId, skippedIds]);

  const activeGroup = groups.find(g => g.id === activeGroupId) || null;

  const handleMerge = async (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => {
    setIsProcessing(true);
    try {
      await onMergeLenders(keepId, mergeIds, mergedData);
      toast({
        title: 'Records merged',
        description: `Combined ${mergeIds.length + 1} entries into one.`,
      });
      // jump to next group
      const remaining = groups.filter(g => g.id !== activeGroupId && !skippedIds.has(g.id));
      setActiveGroupId(remaining[0]?.id || null);
    } catch (e) {
      toast({ title: 'Merge failed', description: 'Could not complete merge.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const totalDuplicates = groups.reduce((s, g) => s + g.lenders.length - 1, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="popup-shell-surface max-w-[min(1400px,96vw)] w-[96vw] h-[92vh] p-0 gap-0 overflow-hidden border-white/10"
        >
          <DialogTitle className="sr-only">Merge duplicate funding sources</DialogTitle>

          {/* Outer header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10">
            <Merge className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Merge Workspace · Funding Sources</span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                {groups.length} group{groups.length !== 1 ? 's' : ''} · {totalDuplicates} possible duplicates
              </span>
            </div>
            <Button
              variant="ghost" size="icon" className="ml-auto h-7 w-7"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <p className="text-base font-medium">No duplicates found</p>
              <p className="text-sm text-muted-foreground mt-1">Your directory is clean.</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-12">
              <div className="col-span-3 xl:col-span-2 min-h-0">
                <GroupQueue
                  groups={groups}
                  activeId={activeGroupId}
                  onSelect={setActiveGroupId}
                  skippedIds={skippedIds}
                />
              </div>
              <div className="col-span-9 xl:col-span-10 min-h-0">
                {activeGroup ? (
                  <MergeWorkspace
                    key={activeGroup.id}
                    group={activeGroup}
                    onMerge={handleMerge}
                    onMarkNotDuplicate={(g) => setNotDupConfirm(g)}
                    onSkip={() => {
                      if (!activeGroup) return;
                      const next = new Set(skippedIds);
                      next.add(activeGroup.id);
                      setSkippedIds(next);
                      const remaining = groups.filter(g => g.id !== activeGroup.id && !next.has(g.id));
                      setActiveGroupId(remaining[0]?.id || null);
                    }}
                    isProcessing={isProcessing}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-10">
                    Select a duplicate group to begin.
                  </div>
                )}
              </div>
            </div>
          )}

          <AlertDialog open={!!notDupConfirm} onOpenChange={() => setNotDupConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mark group as not duplicates?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will hide “{notDupConfirm?.primaryName}” from this session's duplicate review.
                  Records remain unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (notDupConfirm) {
                      const next = new Set(skippedIds);
                      next.add(notDupConfirm.id);
                      setSkippedIds(next);
                      const remaining = groups.filter(g => g.id !== notDupConfirm.id && !next.has(g.id));
                      setActiveGroupId(remaining[0]?.id || null);
                    }
                    setNotDupConfirm(null);
                  }}
                >
                  Mark not duplicate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

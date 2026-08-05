import { useState, useMemo, useCallback } from 'react';
import {
  Check, X, Merge, ChevronLeft, ChevronRight, Building2, User, Mail, MapPin,
  DollarSign, Briefcase, FileText, Tag, Globe, Star, ChevronDown,
  Layers, Sparkles, Plus, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { formatLenderCurrency } from '@/utils/formatLenderCurrency';

interface SideBySideMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
  onMergeLenders: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  selectedLenderIds?: string[];
}

interface DuplicateGroup {
  normalizedName: string;
  lenders: MasterLender[];
}

function normalizeNameForComparison(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

const formatCurrency = (v: number | null | undefined) => formatLenderCurrency(v, '-');
const formatArray = (arr: string[] | null | undefined) => (!arr || arr.length === 0 ? '-' : arr.join(', '));

type SectionKey = 'identity' | 'contact' | 'deal';

interface MergeFieldDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  format: (v: any) => string;
  multiline?: boolean;
  combinable?: boolean;
  section: SectionKey;
}

const MERGE_FIELDS: MergeFieldDef[] = [
  { key: 'name', label: 'Funding Source Name', icon: Building2, format: (v: any) => v || '-', section: 'identity' },
  { key: 'lender_type', label: 'Funding Source Type', icon: Tag, format: (v: any) => v || '-', combinable: true, section: 'identity' },
  { key: 'referral_lender', label: 'Referral Lender', icon: Tag, format: (v: any) => v || '-', section: 'identity' },
  { key: 'nda', label: 'NDA', icon: FileText, format: (v: any) => v || '-', section: 'identity' },
  { key: 'onboarded_to_flex', label: 'Onboarded to Flex', icon: Check, format: (v: any) => v || '-', section: 'identity' },
  { key: 'contact_name', label: 'Contact Name', icon: User, format: (v: any) => v || '-', combinable: true, section: 'contact' },
  { key: 'contact_title', label: 'Contact Title', icon: Briefcase, format: (v: any) => v || '-', combinable: true, section: 'contact' },
  { key: 'email', label: 'Email', icon: Mail, format: (v: any) => v || '-', combinable: true, section: 'contact' },
  { key: 'relationship_owners', label: 'Relationship Owners', icon: User, format: (v: any) => v || '-', combinable: true, section: 'contact' },
  { key: 'gift_address', label: 'Gift Address', icon: MapPin, format: (v: any) => v || '-', section: 'contact' },
  { key: 'lender_one_pager_url', label: 'One Pager URL', icon: Globe, format: (v: any) => v || '-', combinable: true, section: 'contact' },
  { key: 'geo', label: 'Geography', icon: MapPin, format: (v: any) => v || '-', combinable: true, section: 'deal' },
  { key: 'min_deal', label: 'Min Deal Size', icon: DollarSign, format: formatCurrency, section: 'deal' },
  { key: 'max_deal', label: 'Max Deal Size', icon: DollarSign, format: formatCurrency, section: 'deal' },
  { key: 'min_revenue', label: 'Min Revenue', icon: DollarSign, format: formatCurrency, section: 'deal' },
  { key: 'ebitda_min', label: 'Min EBITDA', icon: DollarSign, format: formatCurrency, section: 'deal' },
  { key: 'loan_types', label: 'Loan Types', icon: FileText, format: formatArray, combinable: true, section: 'deal' },
  { key: 'industries', label: 'Industries', icon: Briefcase, format: formatArray, combinable: true, section: 'deal' },
  { key: 'industries_to_avoid', label: 'Industries to Avoid', icon: X, format: formatArray, combinable: true, section: 'deal' },
  { key: 'sponsorship', label: 'Sponsorship', icon: Tag, format: (v: any) => v || '-', section: 'deal' },
  { key: 'sub_debt', label: 'Sub Debt', icon: Tag, format: (v: any) => v || '-', section: 'deal' },
  { key: 'cash_burn', label: 'Cash Burn', icon: Tag, format: (v: any) => v || '-', section: 'deal' },
  { key: 'b2b_b2c', label: 'B2B/B2C', icon: Tag, format: (v: any) => v || '-', section: 'deal' },
  { key: 'refinancing', label: 'Refinancing', icon: Tag, format: (v: any) => v || '-', section: 'deal' },
  { key: 'company_requirements', label: 'Company Requirements', icon: FileText, format: (v: any) => v || '-', multiline: true, section: 'deal' },
  { key: 'deal_structure_notes', label: 'Deal Structure Notes', icon: FileText, format: (v: any) => v || '-', multiline: true, section: 'deal' },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  identity: 'Identity',
  contact: 'Contact',
  deal: 'Deal parameters',
};

// ── helpers ─────────────────────────────────────────────────────────────

function hasValue(v: any): boolean {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function valueKey(v: any): string {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return JSON.stringify([...v].map(x => String(x).trim().toLowerCase()).sort());
  return String(v).trim().toLowerCase();
}

/** Combine values across sources: arrays → union, strings → " | "-joined unique tokens. */
function combineValues(values: any[]): any {
  const nonEmpty = values.filter(hasValue);
  if (nonEmpty.length === 0) return null;
  if (nonEmpty.every(v => Array.isArray(v))) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const arr of nonEmpty as any[][]) {
      for (const item of arr) {
        const k = String(item).trim().toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(item); }
      }
    }
    return out;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of nonEmpty) {
    const tokens = String(v).split(/\s*[|,]\s*/).filter(Boolean);
    for (const t of tokens) {
      const k = t.trim().toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(t); }
    }
  }
  return out.join(' | ');
}

interface DistinctOption {
  /** stable id derived from valueKey */
  id: string;
  value: any;
  formatted: string;
  sourceIndices: number[]; // 0 = primary
  /** True for user-entered overrides not present on any source record. */
  isCustom?: boolean;
}

function buildDistinctOptions(field: MergeFieldDef, lenders: MasterLender[]): DistinctOption[] {
  const byKey = new Map<string, DistinctOption>();
  lenders.forEach((l, idx) => {
    const v = (l as any)[field.key];
    if (!hasValue(v)) return;
    const k = valueKey(v);
    const existing = byKey.get(k);
    if (existing) { existing.sourceIndices.push(idx); }
    else byKey.set(k, { id: k, value: v, formatted: field.format(v), sourceIndices: [idx] });
  });
  // Sort: primary first, then by source count desc
  return [...byKey.values()].sort((a, b) => {
    const aHasP = a.sourceIndices.includes(0) ? 1 : 0;
    const bHasP = b.sourceIndices.includes(0) ? 1 : 0;
    if (aHasP !== bHasP) return bHasP - aHasP;
    return b.sourceIndices.length - a.sourceIndices.length;
  });
}

// ── source chip ─────────────────────────────────────────────────────────

function SourceChip({ idx, isPrimary }: { idx: number; isPrimary: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] leading-none',
        isPrimary
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-muted/60 text-muted-foreground'
      )}
      title={isPrimary ? 'Primary record' : `Source #${idx + 1}`}
    >
      {isPrimary && <Star className="h-2.5 w-2.5 fill-current" />}
      {isPrimary ? 'Primary' : `#${idx + 1}`}
    </span>
  );
}

function CustomChip() {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-px text-[10px] leading-none text-accent"
      title="User-entered custom value"
    >
      <Pencil className="h-2.5 w-2.5" />
      Custom
    </span>
  );
}

/**
 * Parse a raw text input into the typed value the field expects, based on
 * the field's format function. Arrays are produced by splitting on commas
 * (and `|`). Currency/number fields parse digits. All others return the
 * trimmed string.
 */
function parseCustomInput(field: MergeFieldDef, raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (field.format === formatArray) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tok of trimmed.split(/\s*[,|]\s*/)) {
      const t = tok.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out.length ? out : null;
  }
  if (field.format === formatCurrency) {
    const n = Number(trimmed.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return trimmed;
}

// ── selection model ─────────────────────────────────────────────────────

/** A field selection is a non-empty list of option ids.
 *  - length 1  → single pick
 *  - length 2+ → combined (only meaningful for combinable fields; non-combinable
 *    fields always coerce back to a single pick on click). */
interface Selection {
  optionIds: string[];
}

interface ResolvedField {
  field: MergeFieldDef;
  options: DistinctOption[];
  selection: Selection;
  resolvedValue: any;
  resolvedFormatted: string;
  isConflict: boolean; // >1 distinct option
  isCombined: boolean; // user selected 2+ option cards
}

function resolveSelection(
  field: MergeFieldDef,
  options: DistinctOption[],
  selection: Selection,
): { value: any; formatted: string; isCombined: boolean } {
  const selectedOpts = selection.optionIds
    .map(id => options.find(o => o.id === id))
    .filter((o): o is DistinctOption => !!o);
  if (selectedOpts.length === 0) {
    return { value: null, formatted: '-', isCombined: false };
  }
  if (selectedOpts.length === 1 || !field.combinable) {
    const opt = selectedOpts[selectedOpts.length - 1];
    return { value: opt.value, formatted: opt.formatted, isCombined: false };
  }
  const v = combineValues(selectedOpts.map(o => o.value));
  return { value: v, formatted: field.format(v), isCombined: true };
}

// ── Option Card ─────────────────────────────────────────────────────────

interface OptionCardProps {
  formatted: string;
  multiline?: boolean;
  selected: boolean;
  variant: 'pick' | 'combine';
  sources?: { idx: number; isPrimary: boolean }[];
  isCustom?: boolean;
  onClick: () => void;
}

function OptionCard({ formatted, multiline, selected, variant, sources, isCustom, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full rounded-lg border bg-card/40 px-3 py-2 text-left transition-all',
        'hover:-translate-y-px hover:border-primary/40 hover:bg-card/70 hover:shadow-sm',
        'motion-reduce:transform-none motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !selected && 'border-border/60',
        selected && variant === 'pick' && 'border-primary bg-primary/10 ring-1 ring-primary/40',
        selected && variant === 'combine' && 'border-accent bg-accent/10 ring-1 ring-accent/50',
        isCustom && !selected && 'border-accent/30',
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
            variant === 'combine' ? 'rounded-[4px]' : 'rounded-full',
            selected && variant === 'pick' && 'border-primary bg-primary text-primary-foreground',
            selected && variant === 'combine' && 'border-accent bg-accent text-accent-foreground',
            !selected && 'border-border',
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm text-foreground',
              multiline ? 'whitespace-pre-wrap break-words' : 'truncate',
            )}
          >
            {formatted}
          </p>
          {(sources?.length || isCustom) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {isCustom && <CustomChip />}
              {sources?.map(s => <SourceChip key={s.idx} idx={s.idx} isPrimary={s.isPrimary} />)}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ── Resolver Row ────────────────────────────────────────────────────────

interface ResolverRowProps {
  field: MergeFieldDef;
  options: DistinctOption[];
  selection: Selection;
  combinable: boolean;
  isCombined: boolean;
  resolvedFormatted: string;
  onToggle: (optionId: string) => void;
  onAddCustom: (value: any, formatted: string) => void;
}

function ResolverRow({ field, options, selection, combinable, isCombined, resolvedFormatted, onToggle, onAddCustom }: ResolverRowProps) {
  const Icon = field.icon;
  const selectedSet = new Set(selection.optionIds);
  const multiVariant = combinable && selectedSet.size >= 2;
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const isArrayField = field.format === formatArray;
  const placeholder = isArrayField
    ? 'Comma-separated values'
    : field.format === formatCurrency
    ? 'e.g. 5000000'
    : 'Enter a custom value';

  const handleSaveCustom = () => {
    const parsed = parseCustomInput(field, customDraft);
    if (!hasValue(parsed)) {
      setCustomOpen(false);
      setCustomDraft('');
      return;
    }
    onAddCustom(parsed, field.format(parsed));
    setCustomOpen(false);
    setCustomDraft('');
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</span>
        {combinable && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] leading-none',
              isCombined
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
            title="Tap multiple cards to combine their values"
          >
            <Layers className="h-2.5 w-2.5" />
            {isCombined ? `combined · ${selectedSet.size}` : 'multi-select'}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {options.length} options
        </span>
        <button
          type="button"
          onClick={() => setCustomOpen(v => !v)}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] leading-none transition-colors',
            customOpen
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-border bg-muted/40 text-muted-foreground hover:border-accent/40 hover:text-accent',
          )}
          aria-expanded={customOpen}
        >
          <Plus className="h-2.5 w-2.5" />
          Custom value
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(opt => (
          <OptionCard
            key={opt.id}
            formatted={opt.formatted}
            multiline={field.multiline}
            selected={selectedSet.has(opt.id)}
            variant={multiVariant ? 'combine' : 'pick'}
            sources={opt.sourceIndices.map(i => ({ idx: i, isPrimary: i === 0 }))}
            isCustom={opt.isCustom}
            onClick={() => onToggle(opt.id)}
          />
        ))}
      </div>
      {customOpen && (
        <div className="mt-2 rounded-lg border border-accent/40 bg-accent/5 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-accent">
            <Pencil className="h-2.5 w-2.5" />
            New custom value
            {isArrayField && <span className="text-muted-foreground/70 normal-case tracking-normal">· separate with commas</span>}
          </div>
          {field.multiline ? (
            <Textarea
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="text-sm"
              autoFocus
            />
          ) : (
            <Input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSaveCustom(); }
                if (e.key === 'Escape') { setCustomOpen(false); setCustomDraft(''); }
              }}
            />
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => { setCustomOpen(false); setCustomDraft(''); }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleSaveCustom}
              disabled={!customDraft.trim()}
            >
              Use this value
            </Button>
          </div>
        </div>
      )}
      {isCombined && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
          → {resolvedFormatted}
        </p>
      )}
    </div>
  );
}

// ── Merged Preview ──────────────────────────────────────────────────────

function MergedPreview({
  primary,
  resolved,
}: {
  primary: MasterLender;
  resolved: ResolvedField[];
}) {
  const nameField = resolved.find(r => r.field.key === 'name');
  const typeField = resolved.find(r => r.field.key === 'lender_type');
  const rest = resolved.filter(r => r.field.key !== 'name' && r.field.key !== 'lender_type' && hasValue(r.resolvedValue));
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-card/40 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Merged record · live preview
        </div>
        <div className="mb-3">
          <p className="truncate text-base font-semibold text-foreground">
            {nameField?.resolvedFormatted || primary.name}
          </p>
          {typeField && hasValue(typeField.resolvedValue) && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{typeField.resolvedFormatted}</p>
          )}
        </div>
        <div className="space-y-1.5">
          {rest.map(r => {
            const Icon = r.field.icon;
            const tintClass = r.isCombined
              ? 'text-accent'
              : r.isConflict
              ? 'text-primary'
              : 'text-success';
            return (
              <div key={r.field.key} className="flex items-start gap-2 border-b border-border/30 py-1 last:border-b-0">
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tintClass)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.field.label}</p>
                  <p
                    className={cn(
                      'text-xs text-foreground',
                      r.field.multiline ? 'whitespace-pre-wrap break-words' : 'truncate',
                    )}
                  >
                    {r.resolvedFormatted}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        The other records are archived and their links repoint to this one. Reversible for 30 days.
      </p>
    </div>
  );
}

// ── MergeView (left + right) ────────────────────────────────────────────

function MergeView({
  group,
  onMerge,
  onSkip,
  isProcessing,
}: {
  group: DuplicateGroup;
  onMerge: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => void;
  onSkip: () => void;
  isProcessing: boolean;
}) {
  // Per-field distinct options
  const baseFieldOptions = useMemo(() => {
    const map = new Map<string, DistinctOption[]>();
    MERGE_FIELDS.forEach(f => map.set(f.key, buildDistinctOptions(f, group.lenders)));
    return map;
  }, [group]);

  // User-added custom options per field. Stored separately so we can re-derive
  // the merged option list on every render without losing them.
  const [customOptionsByField, setCustomOptionsByField] = useState<Record<string, DistinctOption[]>>({});

  const fieldOptions = useMemo(() => {
    const map = new Map<string, DistinctOption[]>();
    MERGE_FIELDS.forEach(f => {
      const base = baseFieldOptions.get(f.key) || [];
      const custom = customOptionsByField[f.key] || [];
      map.set(f.key, [...base, ...custom]);
    });
    return map;
  }, [baseFieldOptions, customOptionsByField]);

  // Initial selections: pick the primary's option if it has one; else first option
  const [selections, setSelections] = useState<Record<string, Selection>>(() => {
    const initial: Record<string, Selection> = {};
    MERGE_FIELDS.forEach(field => {
      const opts = buildDistinctOptions(field, group.lenders);
      if (opts.length === 0) { initial[field.key] = { optionIds: [] }; return; }
      const primaryOpt = opts.find(o => o.sourceIndices.includes(0)) ?? opts[0];
      initial[field.key] = { optionIds: [primaryOpt.id] };
    });
    return initial;
  });

  const [autoMatchOpen, setAutoMatchOpen] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const resolved: ResolvedField[] = useMemo(() => {
    return MERGE_FIELDS.map(field => {
      const options = fieldOptions.get(field.key) || [];
      const fallback: Selection = { optionIds: options[0] ? [options[0].id] : [] };
      const selection = selections[field.key] ?? fallback;
      const { value, formatted, isCombined } = resolveSelection(field, options, selection);
      return {
        field,
        options,
        selection,
        resolvedValue: value,
        resolvedFormatted: formatted,
        isConflict: options.length > 1,
        isCombined,
      };
    });
  }, [fieldOptions, selections]);

  const conflicts = resolved.filter(r => r.isConflict);
  const matched = resolved.filter(r => !r.isConflict && hasValue(r.resolvedValue));

  const handleToggle = useCallback((fieldKey: string, optionId: string, combinable: boolean) => {
    setSelections(prev => {
      const current = prev[fieldKey]?.optionIds ?? [];
      let next: string[];
      if (!combinable) {
        next = [optionId];
      } else if (current.includes(optionId)) {
        // Remove unless it's the last one (keep at least one selected)
        next = current.length > 1 ? current.filter(id => id !== optionId) : current;
      } else {
        next = [...current, optionId];
      }
      return { ...prev, [fieldKey]: { optionIds: next } };
    });
    setReviewed(prev => new Set(prev).add(fieldKey));
  }, []);

  const handleAddCustom = useCallback((fieldKey: string, value: any, formatted: string) => {
    const id = `custom:${fieldKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const opt: DistinctOption = { id, value, formatted, sourceIndices: [], isCustom: true };
    setCustomOptionsByField(prev => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || []), opt],
    }));
    // Auto-select the new custom value as the sole selection for this field.
    setSelections(prev => ({ ...prev, [fieldKey]: { optionIds: [id] } }));
    setReviewed(prev => new Set(prev).add(fieldKey));
  }, []);

  const handleConfirmMerge = () => {
    const keepId = group.lenders[0].id;
    const mergeIds = group.lenders.slice(1).map(l => l.id);
    const mergedData: Partial<MasterLenderInsert> = {};
    resolved.forEach(r => {
      if (r.field.key === 'created_at') return;
      (mergedData as any)[r.field.key] = r.resolvedValue;
    });
    onMerge(keepId, mergeIds, mergedData);
  };

  // Group conflicts by section
  const conflictsBySection: Record<SectionKey, ResolvedField[]> = {
    identity: conflicts.filter(c => c.field.section === 'identity'),
    contact: conflicts.filter(c => c.field.section === 'contact'),
    deal: conflicts.filter(c => c.field.section === 'deal'),
  };

  const totalConflicts = conflicts.length;
  const reviewedCount = conflicts.filter(c => reviewed.has(c.field.key)).length;
  const progress = totalConflicts === 0 ? 1 : reviewedCount / totalConflicts;

  return (
    <div className="flex h-full flex-col">
      {/* Source row */}
      <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sources</span>
          {group.lenders.map((l, idx) => (
            <span
              key={l.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                idx === 0
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card/40 text-muted-foreground',
              )}
            >
              {idx === 0 && <Star className="h-2.5 w-2.5 fill-current" />}
              <span className="max-w-[160px] truncate">{l.name}</span>
              <span className="opacity-60">· {idx === 0 ? 'Primary' : `#${idx + 1}`}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Two-pane body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* LEFT: resolver */}
        <div className="min-w-0 flex-1 p-4 lg:min-h-0 lg:overflow-y-auto">
          {totalConflicts === 0 && (
            <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center text-sm text-foreground">
              All fields already match across sources. Review the merged record on the right and confirm.
            </div>
          )}

          {(['identity', 'contact', 'deal'] as SectionKey[]).map(section => {
            const items = conflictsBySection[section];
            if (items.length === 0) return null;
            return (
              <section key={section} className="mb-5 last:mb-0">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {SECTION_LABELS[section]}
                  <span className="ml-2 text-muted-foreground/70">· {items.length} need a decision</span>
                </h3>
                <div className="space-y-2">
                  {items.map(r => (
                    <ResolverRow
                      key={r.field.key}
                      field={r.field}
                      options={r.options}
                      selection={r.selection}
                      combinable={!!r.field.combinable}
                      isCombined={r.isCombined}
                      resolvedFormatted={r.resolvedFormatted}
                      onToggle={(id) => handleToggle(r.field.key, id, !!r.field.combinable)}
                      onAddCustom={(value, formatted) => handleAddCustom(r.field.key, value, formatted)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {matched.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-card/20">
              <button
                type="button"
                onClick={() => setAutoMatchOpen(v => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-card/40 rounded-xl"
                aria-expanded={autoMatchOpen}
              >
                <Check className="h-3.5 w-3.5 text-success" />
                <span>{matched.length} fields already match</span>
                <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform motion-reduce:transition-none', autoMatchOpen && 'rotate-180')} />
              </button>
              {autoMatchOpen && (
                <div className="border-t border-border/60 p-3">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {matched.map(r => {
                      const Icon = r.field.icon;
                      return (
                        <div key={r.field.key} className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 px-2 py-1.5">
                          <Icon className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.field.label}</p>
                            <p className={cn('text-xs text-foreground', r.field.multiline ? 'line-clamp-2' : 'truncate')}>{r.resolvedFormatted}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: sticky preview */}
        <aside className="border-t border-border/60 bg-muted/10 p-4 lg:min-h-0 lg:w-[360px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div>
            <MergedPreview primary={group.lenders[0]} resolved={resolved} />
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-border/60 bg-background/60 px-4 py-3">
        <ProgressRing value={progress} />
        <span className="text-xs text-muted-foreground">
          {reviewedCount} of {totalConflicts} conflicts reviewed
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onSkip} disabled={isProcessing}>
            Skip
          </Button>
          <Button size="sm" onClick={handleConfirmMerge} disabled={isProcessing} className="gap-1.5">
            <Merge className="h-3.5 w-3.5" />
            Merge {group.lenders.length} → 1
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r={r} className="fill-none stroke-border" strokeWidth="2.5" />
      <circle
        cx="12"
        cy="12"
        r={r}
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

// ── Dialog Shell ────────────────────────────────────────────────────────

export function SideBySideMergeDialog({
  open,
  onOpenChange,
  lenders,
  onMergeLenders,
  selectedLenderIds,
}: SideBySideMergeDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

  const isManualSelectionMode = selectedLenderIds && selectedLenderIds.length >= 2;

  const duplicateGroups = useMemo(() => {
    if (isManualSelectionMode) {
      const selectedLenders = lenders.filter(l => selectedLenderIds!.includes(l.id));
      if (selectedLenders.length >= 2) {
        return [{
          normalizedName: 'manual-selection',
          lenders: selectedLenders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        }];
      }
      return [];
    }
    const nameMap = new Map<string, MasterLender[]>();
    lenders.forEach(lender => {
      const normalized = normalizeNameForComparison(lender.name);
      const existing = nameMap.get(normalized) || [];
      existing.push(lender);
      nameMap.set(normalized, existing);
    });
    const groups: DuplicateGroup[] = [];
    nameMap.forEach((lenderList, normalizedName) => {
      if (lenderList.length > 1) {
        groups.push({
          normalizedName,
          lenders: lenderList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        });
      }
    });
    return groups.sort((a, b) => b.lenders.length - a.lenders.length);
  }, [lenders, selectedLenderIds, isManualSelectionMode]);

  const currentGroup = duplicateGroups[currentGroupIndex];
  const totalGroups = duplicateGroups.length;

  // Compute conflict/match summary for header
  const summary = useMemo(() => {
    if (!currentGroup) return { match: 0, conflict: 0 };
    let match = 0, conflict = 0;
    MERGE_FIELDS.forEach(f => {
      const opts = buildDistinctOptions(f, currentGroup.lenders);
      if (opts.length > 1) conflict++;
      else if (opts.length === 1) match++;
    });
    return { match, conflict };
  }, [currentGroup]);

  const handleMerge = async (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => {
    setIsProcessing(true);
    try {
      await onMergeLenders(keepId, mergeIds, mergedData);
      toast({ title: 'Lenders merged', description: `Successfully merged ${mergeIds.length + 1} entries into one.` });
      if (currentGroupIndex < totalGroups - 1) setCurrentGroupIndex(prev => prev + 1);
      else { onOpenChange(false); setCurrentGroupIndex(0); }
    } catch {
      toast({ title: 'Merge failed', description: 'An error occurred while merging lenders.', variant: 'destructive' });
    } finally { setIsProcessing(false); }
  };

  const handleSkip = () => {
    if (currentGroupIndex < totalGroups - 1) setCurrentGroupIndex(prev => prev + 1);
    else { onOpenChange(false); setCurrentGroupIndex(0); }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) setCurrentGroupIndex(0);
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-full max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 bg-gradient-to-b from-primary/10 to-transparent px-5 py-3">
          <div className="flex items-start gap-3">
            <ConvergingRings />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                Side-by-Side Merge
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {currentGroup
                  ? <>Resolving {currentGroup.lenders.length} records into 1 · <span className="text-success">{summary.match} match</span> · <span className="text-primary">{summary.conflict} need a decision</span></>
                  : 'No duplicate funding sources found'}
              </DialogDescription>
            </div>
            {totalGroups > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentGroupIndex(i => Math.max(0, i - 1))} disabled={currentGroupIndex === 0 || isProcessing} aria-label="Previous group">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[44px] text-center text-[11px] text-muted-foreground">
                  {currentGroupIndex + 1} / {totalGroups}
                </span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentGroupIndex(i => Math.min(totalGroups - 1, i + 1))} disabled={currentGroupIndex === totalGroups - 1 || isProcessing} aria-label="Next group">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {currentGroup ? (
            <MergeView
              key={currentGroup.normalizedName + ':' + currentGroupIndex}
              group={currentGroup}
              onMerge={handleMerge}
              onSkip={handleSkip}
              isProcessing={isProcessing}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <Check className="h-8 w-8 text-success" />
                </div>
                <p className="text-lg font-medium">No duplicates found</p>
                <p className="mt-1 text-muted-foreground">Your funding-source database is clean.</p>
                <Button className="mt-4" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConvergingRings() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0" aria-hidden="true">
      <circle cx="13" cy="18" r="8" className="fill-none stroke-primary/70" strokeWidth="1.5" />
      <circle cx="23" cy="18" r="8" className="fill-none stroke-accent/70" strokeWidth="1.5" strokeDasharray="2 2" />
      <circle cx="18" cy="18" r="3" className="fill-primary" />
    </svg>
  );
}

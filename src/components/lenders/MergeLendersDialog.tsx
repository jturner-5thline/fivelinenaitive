import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Merge, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { detectDuplicateLenders } from '@/lib/lenderDuplicates';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
  onMergeLenders: (keepId: string, mergeIds: string[], mergedData: Partial<MasterLenderInsert>) => Promise<void>;
  /** When 2+ ids are given, merge exactly those; otherwise walk auto-detected duplicates. */
  selectedLenderIds?: string[];
}

type Kind = 'text' | 'number' | 'array' | 'long';
const FIELDS: { key: string; label: string; kind: Kind }[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'website', label: 'Website', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'text' },
  { key: 'contact_name', label: 'Contact', kind: 'text' },
  { key: 'contact_title', label: 'Contact title', kind: 'text' },
  { key: 'contact_phone', label: 'Contact phone', kind: 'text' },
  { key: 'linkedin_url', label: 'LinkedIn', kind: 'text' },
  { key: 'address', label: 'Address', kind: 'text' },
  { key: 'geo', label: 'Geography', kind: 'text' },
  { key: 'tier', label: 'Tier', kind: 'text' },
  { key: 'lender_type', label: 'Funding source type', kind: 'text' },
  { key: 'loan_types', label: 'Loan types', kind: 'array' },
  { key: 'min_deal', label: 'Min deal', kind: 'number' },
  { key: 'max_deal', label: 'Max deal', kind: 'number' },
  { key: 'min_revenue', label: 'Min revenue', kind: 'number' },
  { key: 'ebitda_min', label: 'Min EBITDA', kind: 'number' },
  { key: 'industries', label: 'Industries', kind: 'array' },
  { key: 'industries_to_avoid', label: 'Industries to avoid', kind: 'array' },
  { key: 'tags', label: 'Tags', kind: 'array' },
  { key: 'relationship_owners', label: 'Relationship owners', kind: 'text' },
  { key: 'nda', label: 'NDA', kind: 'text' },
  { key: 'referral_agreement', label: 'Referral agreement', kind: 'text' },
  { key: 'company_requirements', label: 'Requirements', kind: 'long' },
  { key: 'deal_structure_notes', label: 'Deal structure notes', kind: 'long' },
  { key: 'funding_source_notes', label: 'Notes', kind: 'long' },
  { key: 'about_notes', label: 'About', kind: 'long' },
];

const get = (l: MasterLender, k: string) => (l as any)[k];
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
const fmt = (kind: Kind, v: unknown) => {
  if (empty(v)) return '—';
  if (kind === 'number') { const n = Number(v); return isFinite(n) ? `$${n.toLocaleString()}` : String(v); }
  if (kind === 'array') return arr(v).join(', ');
  return String(v);
};
const norm = (v: unknown) => (Array.isArray(v) ? [...v].map(s => String(s).toLowerCase().trim()).sort().join('|') : String(v ?? '').toLowerCase().trim());
const filled = (l: MasterLender) => FIELDS.filter(f => !empty(get(l, f.key))).length;

function MergeGroup({ lenders, onMerge, busy, footerLeft }: {
  lenders: MasterLender[];
  onMerge: (keepId: string, mergeIds: string[], data: Partial<MasterLenderInsert>) => void;
  busy: boolean;
  footerLeft?: React.ReactNode;
}) {
  const [primaryId, setPrimaryId] = useState(lenders[0].id);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [arrays, setArrays] = useState<Record<string, string[]>>({});
  const [showAll, setShowAll] = useState(false);

  const primary = lenders.find(l => l.id === primaryId)!;
  const ordered = [primary, ...lenders.filter(l => l.id !== primaryId)];

  const rows = useMemo(() => FIELDS.map(f => {
    const withVal = ordered.filter(l => !empty(get(l, f.key)));
    const distinct = new Set(withVal.map(l => norm(get(l, f.key))));
    return { f, withVal, conflict: distinct.size > 1 };
  }), [ordered]);

  const valueFor = (key: string, kind: Kind): unknown => {
    if (kind === 'array') {
      if (arrays[key]) return arrays[key];
      const u = new Map<string, string>();
      ordered.forEach(l => arr(get(l, key)).forEach(t => { if (!u.has(t.toLowerCase())) u.set(t.toLowerCase(), t); }));
      return [...u.values()];
    }
    const pick = picks[key] && ordered.find(l => l.id === picks[key]);
    if (pick) return get(pick, key);
    const src = ordered.find(l => !empty(get(l, key)));
    return src ? get(src, key) : null;
  };

  const conflicts = rows.filter(r => r.conflict);
  const others = rows.filter(r => !r.conflict && r.withVal.length > 0);
  const visible = showAll ? [...conflicts, ...others] : conflicts;

  const submit = () => {
    const data: Record<string, unknown> = {};
    FIELDS.forEach(f => {
      const v = valueFor(f.key, f.kind);
      if (!empty(v)) data[f.key] = f.kind === 'array' && !Array.isArray(get(primary, f.key)) && typeof get(primary, f.key) === 'string' ? (v as string[]).join(', ') : v;
    });
    onMerge(primaryId, ordered.slice(1).map(l => l.id), data as Partial<MasterLenderInsert>);
  };

  const cols = `160px repeat(${ordered.length}, minmax(0,1fr))`;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-5 pt-4 pb-3 border-b border-border/60">
        <p className="text-xs text-muted-foreground mb-2">Choose the record to keep. The others merge into it.</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0,1fr))` }}>
          {lenders.map(l => {
            const isP = l.id === primaryId;
            return (
              <button key={l.id} type="button" onClick={() => setPrimaryId(l.id)}
                className={cn('text-left rounded-lg border px-3 py-2 transition-colors min-w-0',
                  isP ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-border')}>
                <div className="flex items-center gap-1.5">
                  {isP ? <Star className="h-3.5 w-3.5 text-primary fill-current shrink-0" /> : <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/50 shrink-0" />}
                  <span className="text-sm font-medium truncate">{l.name}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">
                  {isP ? 'Keep' : 'Merge into kept record'} · {filled(l)} fields filled{(l as any).tier ? ` · ${(l as any).tier}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
        {conflicts.length === 0 ? (
          <div className="rounded-lg border border-border/60 px-4 py-3 text-sm flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" /> No differences to resolve — blanks are filled in automatically.
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mb-2">{conflicts.length} field{conflicts.length === 1 ? '' : 's'} differ. Click the value to keep.</p>
        )}
        <div className="divide-y divide-border/40">
          {visible.map(({ f, conflict }) => (
            <div key={f.key} className="grid gap-2 py-2 items-start" style={{ gridTemplateColumns: cols }}>
              <div className="text-xs text-muted-foreground pt-1.5">{f.label}</div>
              {f.kind === 'array' ? (
                <div style={{ gridColumn: `span ${ordered.length}` }} className="flex flex-wrap gap-1.5">
                  {(valueFor(f.key, 'array') as string[]).map(t => (
                    <span key={t} className="inline-flex items-center gap-1 text-xs rounded-full border border-border/60 px-2 py-0.5">
                      {t}
                      <button type="button" aria-label={`Remove ${t}`} onClick={() => setArrays(p => ({ ...p, [f.key]: (valueFor(f.key, 'array') as string[]).filter(x => x !== t) }))}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : ordered.map(l => {
                const v = get(l, f.key);
                const chosen = norm(valueFor(f.key, f.kind)) === norm(v) && !empty(v);
                return (
                  <button key={l.id} type="button" disabled={empty(v) || !conflict}
                    onClick={() => setPicks(p => ({ ...p, [f.key]: l.id }))}
                    className={cn('text-left text-sm rounded-md border px-2.5 py-1.5 min-w-0 break-words',
                      f.kind === 'long' && 'line-clamp-4',
                      empty(v) ? 'border-transparent text-muted-foreground/50' :
                      chosen ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-border',
                      !conflict && 'cursor-default')}>
                    {fmt(f.kind, v)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {others.length > 0 && (
          <button type="button" className="mt-3 text-xs text-primary hover:underline" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Hide matching fields' : `Show all fields (${others.length} matching)`}
          </button>
        )}
      </div>

      <div className="border-t border-border/60 px-5 py-3 flex items-center gap-3 flex-wrap">
        {footerLeft}
        <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          Deals, contacts, notes and history move to <span className="text-foreground">{primary.name}</span>. The other {ordered.length - 1 === 1 ? 'record is' : `${ordered.length - 1} records are`} removed.
        </p>
        <Button onClick={submit} disabled={busy} className="gap-1.5">
          <Merge className="h-4 w-4" /> Merge {ordered.length} records
        </Button>
      </div>
    </div>
  );
}

export function MergeLendersDialog({ open, onOpenChange, lenders, onMergeLenders, selectedLenderIds }: Props) {
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"][data-state="open"]') && document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [open]);

  const selectionMode = !!selectedLenderIds && selectedLenderIds.length >= 2;

  const groups = useMemo(() => {
    if (!open) return [] as { id: string; lenders: MasterLender[] }[];
    const byId = new Map(lenders.map(l => [l.id, l]));
    if (selectionMode) {
      const ls = selectedLenderIds!.map(id => byId.get(id)).filter(Boolean) as MasterLender[];
      ls.sort((a, b) => filled(b) - filled(a));
      return ls.length >= 2 ? [{ id: 'selection', lenders: ls }] : [];
    }
    const { groups } = detectDuplicateLenders(lenders.map(l => ({ id: l.id, name: l.name || '', website: (l as any).website ?? null, email: (l as any).email ?? null })));
    return groups
      .map(g => ({ id: g.groupId, lenders: (g.memberIds.map(id => byId.get(id)).filter(Boolean) as MasterLender[]).sort((a, b) => filled(b) - filled(a)) }))
      .filter(g => g.lenders.length > 1 && !skipped.has(g.id));
  }, [open, lenders, selectionMode, selectedLenderIds, skipped]);

  useEffect(() => { if (idx >= groups.length) setIdx(Math.max(0, groups.length - 1)); }, [groups.length, idx]);
  useEffect(() => { if (!open) { setIdx(0); setSkipped(new Set()); } }, [open]);

  const group = groups[idx];

  const handleMerge = async (keepId: string, mergeIds: string[], data: Partial<MasterLenderInsert>) => {
    setBusy(true);
    try {
      await onMergeLenders(keepId, mergeIds, data);
      toast({ title: 'Records merged', description: `Combined ${mergeIds.length + 1} records into one.` });
      if (selectionMode || groups.length <= 1) onOpenChange(false);
    } catch {
      toast({ title: 'Merge failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const skip = () => group && setSkipped(s => new Set(s).add(group.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="popup-shell-surface max-w-[min(1100px,95vw)] w-[95vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/60 pr-12">
          <Merge className="h-4 w-4 text-primary" />
          <DialogTitle className="text-base font-semibold">Merge funding sources</DialogTitle>
          {!selectionMode && groups.length > 0 && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => setIdx(i => i - 1)} aria-label="Previous group">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Duplicate {idx + 1} of {groups.length}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx >= groups.length - 1} onClick={() => setIdx(i => i + 1)} aria-label="Next group">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        {group ? (
          <MergeGroup
            key={group.id + group.lenders.map(l => l.id).join()}
            lenders={group.lenders}
            onMerge={handleMerge}
            busy={busy}
            footerLeft={!selectionMode && (
              <Button variant="ghost" size="sm" onClick={skip}>Not duplicates / skip</Button>
            )}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <Check className="h-8 w-8 text-primary mb-2" />
            <p className="font-medium">No duplicates to merge</p>
            <p className="text-sm text-muted-foreground mt-1">Tip: select 2+ funding sources in the list and click Merge.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Merge, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const FILL_FIELDS = ['domain', 'industry', 'owner_user_id', 'phone', 'linkedin_url', 'description', 'hq_city', 'hq_state', 'hq_country'] as const;
type DupMatchMode = 'any' | 'name' | 'domain';
interface CompanyDupGroup { id: string; memberIds: string[]; reasons: string[] }

type Row = Record<string, any> & { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When given, only these companies are reviewed as a single group. */
  selectedIds?: string[];
}

export function CompanyDuplicatesDialog({ open, onOpenChange, selectedIds }: Props) {
  const { company } = useCompany();
  const qc = useQueryClient();
  const [mode, setMode] = useState<DupMatchMode>('any');
  const [filter, setFilter] = useState('');
  const [primary, setPrimary] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>({});
  const [confirm, setConfirm] = useState<CompanyDupGroup | null>(null);
  const [merging, setMerging] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const debouncedFilter = useDebouncedValue(filter, 350);

  const { data: scan = [], isLoading, error: scanError } = useQuery({
    queryKey: ['crm-companies-dup-scan', company?.id, mode, debouncedFilter],
    enabled: open && !!company?.id && !selectedIds?.length,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_crm_company_duplicates' as any, {
        p_org: company!.id, p_mode: mode, p_search: debouncedFilter.trim() || null, p_limit: 300,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: selectedRows = [], isLoading: selLoading } = useQuery({
    queryKey: ['crm-companies-dup-selected', selectedIds],
    enabled: open && !!selectedIds?.length,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_companies')
        .select('id,name,domain,industry,hq_city,hq_state,created_at').in('id', selectedIds!);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = selectedIds?.length ? selectedRows : scan;
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const groups = useMemo<CompanyDupGroup[]>(() => {
    if (selectedIds?.length) {
      const ids = selectedIds.filter((id) => byId.has(id));
      return ids.length > 1 ? [{ id: 'selected', memberIds: ids, reasons: [] }] : [];
    }
    const m = new Map<string, CompanyDupGroup>();
    for (const r of scan) {
      const g = m.get(r.group_key) ?? { id: r.group_key, memberIds: [], reasons: [r.reason] };
      if (!g.memberIds.includes(r.id)) g.memberIds.push(r.id);
      m.set(r.group_key, g);
    }
    return [...m.values()];
  }, [scan, selectedIds, byId]);
  const loading = selectedIds?.length ? selLoading : isLoading;

  const primaryOf = (g: CompanyDupGroup) => primary[g.id] ?? g.memberIds[0];
  const mergeIdsOf = (g: CompanyDupGroup) =>
    g.memberIds.filter((id) => id !== primaryOf(g) && !excluded[g.id]?.has(id));

  const toggleInclude = (gid: string, id: string) => setExcluded((p) => {
    const s = new Set(p[gid] ?? []);
    s.has(id) ? s.delete(id) : s.add(id);
    return { ...p, [gid]: s };
  });

  /** Fills blank primary fields from duplicates, then merges via RPC. Returns merged count. */
  const mergeOne = async (keepId: string, mergeIds: string[]) => {
    const { data: full, error: fErr } = await supabase.from('crm_companies')
      .select(['id', 'name', ...FILL_FIELDS].join(',')).in('id', [keepId, ...mergeIds]);
    if (fErr) throw fErr;
    const fullById = new Map(((full ?? []) as unknown as Row[]).map((r) => [r.id, r]));
    const keep = fullById.get(keepId) ?? byId.get(keepId)!;
    const liveIds = mergeIds.filter((id) => fullById.has(id));
    if (!fullById.has(keepId) || !liveIds.length) return { name: keep?.name, merged: 0 };
    const fill: Record<string, any> = {};
    for (const f of FILL_FIELDS) {
      if (keep[f] == null || keep[f] === '') {
        const src = liveIds.map((id) => fullById.get(id)?.[f]).find((v) => v != null && v !== '');
        if (src != null) fill[f] = src;
      }
    }
    if (Object.keys(fill).length) {
      const { error } = await supabase.from('crm_companies').update(fill as any).eq('id', keepId);
      if (error) throw error;
    }
    const { error } = await supabase.rpc('merge_crm_companies' as any, { p_primary_id: keepId, p_duplicate_ids: liveIds });
    if (error) throw error;
    return { name: keep.name, merged: liveIds.length };
  };

  const refresh = () =>
    ['crm-companies', 'crm-companies-infinite', 'crm-companies-dup-scan', 'crm-companies-dup-selected', 'contacts', 'crm-company'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }));

  const runMerge = async (g: CompanyDupGroup) => {
    const mergeIds = mergeIdsOf(g);
    if (!mergeIds.length) return;
    setMerging(true);
    try {
      const { name, merged } = await mergeOne(primaryOf(g), mergeIds);
      toast.success(`Merged ${merged} compan${merged === 1 ? 'y' : 'ies'} into ${name}`);
      refresh();
      if (selectedIds?.length) onOpenChange(false);
    } catch (e: any) {
      toast.error('Merge failed', { description: e.message });
    } finally {
      setMerging(false);
      setConfirm(null);
    }
  };

  const mergeableGroups = groups.filter((g) => mergeIdsOf(g).length > 0);
  const mergeAllCount = mergeableGroups.reduce((n, g) => n + mergeIdsOf(g).length, 0);

  const runMergeAll = async () => {
    setMerging(true);
    // Groups can overlap (same name in one, same domain in another): follow removed IDs to their survivor.
    const redirect = new Map<string, string>();
    const resolve = (id: string) => { let x = id; while (redirect.has(x)) x = redirect.get(x)!; return x; };
    let groupsDone = 0, total = 0, failed = 0;
    for (const g of mergeableGroups) {
      setProgress({ done: groupsDone, total: mergeableGroups.length });
      const keepId = resolve(primaryOf(g));
      const ids = [...new Set(mergeIdsOf(g).map(resolve))].filter((id) => id !== keepId);
      try {
        if (ids.length) {
          const { merged } = await mergeOne(keepId, ids);
          total += merged;
          ids.forEach((id) => redirect.set(id, keepId));
        }
      } catch {
        failed++;
      }
      groupsDone++;
    }
    setProgress(null);
    setMerging(false);
    setConfirmAll(false);
    refresh();
    if (failed) toast.error(`Merged ${total} companies; ${failed} group(s) failed`, { description: 'Review the remaining groups and try again.' });
    else toast.success(`Merged ${total} duplicate compan${total === 1 ? 'y' : 'ies'} across ${groupsDone} group(s)`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedIds?.length ? 'Merge selected companies' : 'Duplicate companies'}</DialogTitle>
            <DialogDescription>
              Pick the record to keep. Contacts, deals, tasks, activity, files and partners move to it; the others are removed.
            </DialogDescription>
          </DialogHeader>

          {!selectedIds?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={mode} onValueChange={(v) => setMode(v as DupMatchMode)}>
                <TabsList>
                  <TabsTrigger value="any">Name or domain</TabsTrigger>
                  <TabsTrigger value="name">Name</TabsTrigger>
                  <TabsTrigger value="domain">Domain</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter groups…" className="pl-8 h-9" />
              </div>
              <span className="text-xs text-muted-foreground">{groups.length}{groups.length >= 300 ? '+' : ''} group{groups.length === 1 ? '' : 's'}</span>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Scanning companies…</div>
            ) : scanError && !selectedIds?.length ? (
              <p className="py-12 text-center text-sm text-destructive">Couldn't scan for duplicates: {(scanError as Error).message}</p>
            ) : groups.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No duplicates found.</p>
            ) : groups.map((g) => (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex gap-1">
                    {g.reasons.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">Same {r}: {g.id.split(':').slice(1).join(':')}</Badge>)}
                  </div>
                  <Button size="sm" disabled={merging || mergeIdsOf(g).length === 0} onClick={() => setConfirm(g)} className="gap-1.5">
                    <Merge className="h-3.5 w-3.5" /> Merge {mergeIdsOf(g).length + 1}
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {g.memberIds.map((id) => {
                    const r = byId.get(id);
                    if (!r) return null;
                    const isKeep = primaryOf(g) === id;
                    const included = isKeep || !excluded[g.id]?.has(id);
                    return (
                      <div key={id} className={cn('flex items-center gap-3 py-2 text-sm', !included && 'opacity-50')}>
                        <input type="radio" name={`keep-${g.id}`} checked={isKeep} onChange={() => setPrimary((p) => ({ ...p, [g.id]: id }))} aria-label={`Keep ${r.name}`} className="accent-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[r.domain, r.industry, [r.hq_city, r.hq_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        {isKeep ? (
                          <Badge className="text-[10px]">Keep</Badge>
                        ) : (
                          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleInclude(g.id, id)}>
                            {included ? 'Not a duplicate' : 'Include'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge companies?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && `${mergeIdsOf(confirm).length} record(s) will be merged into "${byId.get(primaryOf(confirm))?.name}" and then removed. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={merging} onClick={(e) => { e.preventDefault(); if (confirm) void runMerge(confirm); }}>
              {merging && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

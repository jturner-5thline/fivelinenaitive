import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useDealsContext } from '@/contexts/DealsContext';

export const INTRODUCTIONS_DIALOG_EVENT = 'deal-introductions-stage';

export interface IntroductionsDialogDetail {
  dealId: string;
  dealName: string;
  companyId: string;
}

const SENT_DRL_FALLBACK_ID = 'e8be95f3-4e34-4e72-999e-bbf79789d9a7';

/** Resolve the tenant's "Sent DRL" lender stage id from lender_stage_configs. */
async function resolveSentDrlStageId(companyId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('lender_stage_configs')
      .select('stages')
      .eq('company_id', companyId)
      .maybeSingle();
    const stages = ((data as any)?.stages || []) as Array<{ id: string; label: string }>;
    const match = stages.find(s => (s.label || '').toLowerCase().trim() === 'sent drl');
    return match?.id || SENT_DRL_FALLBACK_ID;
  } catch {
    return SENT_DRL_FALLBACK_ID;
  }
}

/**
 * 5th Line only: when a deal moves to the "Introductions" stage in the
 * In Development pipeline, the user must record which funding sources the
 * client was introduced to. Each selected funding source is attached to the
 * deal at the "Sent DRL" stage.
 */
export function IntroducedFundingSourcesDialog() {
  const { addLenderToDeal, refreshDeals } = useDealsContext();
  const [detail, setDetail] = useState<IntroductionsDialogDetail | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as IntroductionsDialogDetail;
      if (!d?.dealId) return;
      setDetail(d);
      setSearch('');
      setSelected(new Set());
    };
    window.addEventListener(INTRODUCTIONS_DIALOG_EVENT, handler);
    return () => window.removeEventListener(INTRODUCTIONS_DIALOG_EVENT, handler);
  }, []);

  // Load funding sources already attached to this deal so we don't duplicate.
  useEffect(() => {
    if (!detail?.dealId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deal_lenders')
        .select('name')
        .eq('deal_id', detail.dealId);
      if (cancelled) return;
      setExisting(new Set(((data as any[]) || []).map(r => (r.name || '').toLowerCase())));
    })();
    return () => { cancelled = true; };
  }, [detail?.dealId]);

  const trimmed = search.trim();
  const { lenders, loading } = useMasterLenders({
    searchQuery: trimmed.length >= 2 ? trimmed : '',
    pageSize: 500,
  });

  const options = useMemo(() => {
    const q = trimmed.toLowerCase().replace(/\s+/g, '');
    const list = q
      ? lenders.filter(l => l.name.toLowerCase().replace(/\s+/g, '').includes(q))
      : lenders;
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300);
  }, [lenders, trimmed]);

  const toggle = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!detail || selected.size === 0) return;
    setSaving(true);
    try {
      const stageId = await resolveSentDrlStageId(detail.companyId);
      const names = Array.from(selected);
      for (const name of names) {
        await addLenderToDeal(detail.dealId, {
          name,
          stage: stageId,
          trackingStatus: 'active',
        } as any);
      }
      await refreshDeals();
      toast.success(
        `${names.length} funding source${names.length === 1 ? '' : 's'} added at Sent DRL`,
      );
      setDetail(null);
    } catch (err) {
      console.error('[IntroducedFundingSources] failed', err);
      toast.error('Could not add funding sources');
    } finally {
      setSaving(false);
    }
  };

  const open = !!detail;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) setDetail(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Who was introduced?</DialogTitle>
          <DialogDescription>
            {detail?.dealName ? `${detail.dealName} moved to Introductions. ` : ''}
            Select the funding sources involved in the introductions. They'll be added to
            the deal at the <span className="font-medium text-foreground">Sent DRL</span> stage.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search funding sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <ScrollArea className="h-72 rounded-md border">
          {loading && options.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading funding sources...
            </div>
          ) : options.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
              No funding sources found
            </div>
          ) : (
            <div className="divide-y">
              {options.map(l => {
                const already = existing.has(l.name.toLowerCase());
                const checked = selected.has(l.name);
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={already}
                    onClick={() => toggle(l.name)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Checkbox checked={checked || already} disabled={already} className="pointer-events-none" />
                    <span className="flex-1 truncate">{l.name}</span>
                    {l.tier && <Badge variant="outline" className="text-[10px]">{l.tier}</Badge>}
                    {already && <span className="text-xs text-muted-foreground">On deal</span>}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDetail(null)} disabled={saving}>
              Skip for now
            </Button>
            <Button onClick={handleSave} disabled={selected.size === 0 || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add at Sent DRL
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

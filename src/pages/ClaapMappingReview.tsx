import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useClaapReviewQueue, useClaapReviewSummary, useClaapScoringRuns, useClaapMapping,
} from '@/hooks/useClaapMapping';
import { ClaapMappingPanel } from '@/components/claap/ClaapMappingPanel';
import { ChevronDown, ChevronRight, FlaskConical, Activity, RefreshCw, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ADMIN_EMAILS = ['jturner@5thline.co', 'ppina@5thline.co'];

function bandColor(score: number) {
  if (score >= 0.9) return 'text-emerald-400';
  if (score >= 0.65) return 'text-amber-400';
  return 'text-muted-foreground';
}

function sourceLabel(s: string) {
  return s === 'auto' ? 'Auto' : s === 'eod' ? 'EOD' : s === 'manual' ? 'Manual' : 'Post-call';
}

function RowSuggestions({ recordingId }: { recordingId: string }) {
  const { candidates, links, rescore } = useClaapMapping(recordingId);
  const top = useMemo(() => {
    const out: Record<string, typeof candidates[number] | undefined> = {};
    for (const c of candidates) {
      if (!out[c.entity_type] || (out[c.entity_type]!.score < c.score)) out[c.entity_type] = c;
    }
    return out;
  }, [candidates]);
  const linkByType = new Map(links.map(l => [l.entity_type, l]));

  return (
    <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
      {(['meeting','contact','company','deal'] as const).map(et => {
        const linked = linkByType.get(et);
        const c = top[et];
        const score = linked?.confidence ?? c?.score ?? 0;
        const src = linked?.source ?? c?.run_type ?? null;
        if (!c && !linked) return (
          <Badge key={et} variant="outline" className="text-[10px] opacity-60">{et}: —</Badge>
        );
        return (
          <TooltipProvider key={et} delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <span className="capitalize">{et}</span>
                  <span className={bandColor(score)}>{Math.round(score * 100)}%</span>
                  {src && <span className="text-muted-foreground">· {sourceLabel(src)}</span>}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="text-xs space-y-1">
                  <div className="font-medium">Reasons</div>
                  {(c?.reasons || []).slice(0, 4).map((r, i) => <div key={i}>• {r.label}</div>)}
                  {!c?.reasons?.length && <div className="text-muted-foreground">No reason metadata</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      <Button size="sm" variant="ghost" className="h-6 text-[10px] ml-auto"
        onClick={(e) => { e.stopPropagation(); rescore.mutate(); }}
        disabled={rescore.isPending}
      >
        <RefreshCw className={`h-3 w-3 mr-1 ${rescore.isPending ? 'animate-spin' : ''}`} />
        Rescore
      </Button>
    </div>
  );
}

function DiagnosticsDrawer() {
  const { data: runs = [], isLoading } = useClaapScoringRuns();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm"><Activity className="h-3 w-3 mr-1" /> Diagnostics</Button>
      </SheetTrigger>
      <SheetContent className="w-[480px] sm:w-[560px]">
        <SheetHeader><SheetTitle>Recent scoring runs</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading ? <Skeleton className="h-20" /> : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No runs yet.</div>
          ) : runs.map(r => (
            <div key={r.id} className="rounded-md border border-border p-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px]">{r.id.slice(0,8)}</span>
                <Badge variant="outline" className="text-[10px]">{r.run_type}</Badge>
              </div>
              <div className="text-muted-foreground">
                {new Date(r.started_at).toLocaleString()} · cand {r.candidates_written} · auto {r.auto_links_written}
              </div>
              {r.error && <div className="text-destructive">{r.error}</div>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Global Claap mapping review queue.
 * Lists recordings with pending suggestions; expand to reveal the per-recording
 * Mapping panel with full per-entity scoring + accept/reject actions.
 */
export default function ClaapMappingReview() {
  const { data: rows = [], isLoading } = useClaapReviewQueue();
  const { data: summary } = useClaapReviewSummary();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<Array<{ id: string; title: string | null; started_at: string | null; external_id: string | null; summary_len: number }>>([]);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  const isAdmin = !!email && ADMIN_EMAILS.includes(email);

  const runSmoke = async () => {
    const { data, error } = await (supabase.rpc as any)('claap_run_smoke_test');
    if (error) { toast.error(error.message); return; }
    toast.success(`Smoke test: auto=${data?.bands?.auto ?? 0}, review=${data?.bands?.review ?? 0}, hold=${data?.bands?.hold ?? 0}`);
    console.log('claap_run_smoke_test result', data);
  };

  const loadOrphans = useCallback(async () => {
    setOrphanLoading(true);
    try {
      const { data, error } = await supabase
        .from('claap_recordings')
        .select('id, title, started_at, external_id, summary')
        .order('started_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const recIds = (data ?? []).map((r: any) => r.id);
      if (recIds.length === 0) { setOrphans([]); return; }
      const { data: links } = await supabase
        .from('claap_recording_links')
        .select('recording_id')
        .eq('link_role', 'primary_meeting')
        .in('recording_id', recIds);
      const linked = new Set((links ?? []).map((l: any) => l.recording_id));
      const out = (data ?? [])
        .filter((r: any) => !linked.has(r.id))
        .map((r: any) => ({
          id: r.id,
          title: r.title,
          started_at: r.started_at,
          external_id: r.external_id,
          summary_len: (r.summary || '').length,
        }));
      setOrphans(out);
    } catch (err: any) {
      console.warn('loadOrphans failed', err);
    } finally {
      setOrphanLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrphans(); }, [loadOrphans]);

  const repairOrphans = async () => {
    setRepairing(true);
    try {
      const { data, error } = await (supabase.rpc as any)('claap_link_orphan_recordings');
      if (error) throw error;
      const repaired = data?.orphans_repaired ?? 0;
      const created = data?.meetings_created ?? 0;
      toast.success(`Repaired ${repaired} orphan recording(s); created ${created} synthetic meeting(s).`);
      await loadOrphans();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to repair orphans');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Claap Mapping Review</h1>
            <p className="text-sm text-muted-foreground">
              Recordings with pending entity-resolution suggestions. Accept high-confidence
              matches or reject incorrect ones; the engine re-scores nightly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={runSmoke}>
                <FlaskConical className="h-3 w-3 mr-1" /> Run smoke test
              </Button>
            )}
            {isAdmin && <DiagnosticsDrawer />}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Auto-linked today', value: summary?.autoToday ?? 0, tone: 'text-emerald-400' },
            { label: 'Suggested (post-call)', value: summary?.postCall ?? 0, tone: 'text-amber-400' },
            { label: 'Suggested (EOD)', value: summary?.eod ?? 0, tone: 'text-amber-400' },
            { label: 'Needs review', value: summary?.needsReview ?? 0, tone: 'text-primary' },
            { label: 'Rejected', value: summary?.rejected ?? 0, tone: 'text-muted-foreground' },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`text-xl font-semibold ${s.tone}`}>{s.value}</div>
            </Card>
          ))}
        </div>
      </header>

      {orphans.length > 0 && (
        <Card className="p-4 space-y-3 border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Orphan recordings ({orphans.length})</div>
              <div className="text-xs text-muted-foreground">
                Claap recordings with no primary meeting link. Repair to surface them on Daily Rundown.
              </div>
            </div>
            <Button size="sm" onClick={repairOrphans} disabled={repairing || orphanLoading}>
              <Link2 className="h-3 w-3 mr-1" /> {repairing ? 'Repairing…' : 'Find/create meetings'}
            </Button>
          </div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {orphans.slice(0, 20).map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/30">
                <div className="min-w-0">
                  <div className="truncate font-medium">{o.title || 'Untitled'}</div>
                  <div className="text-muted-foreground truncate">
                    {o.started_at ? new Date(o.started_at).toLocaleString() : '—'} · ext:{o.external_id} · summary {o.summary_len}b
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No recordings need review right now.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const open = expanded === r.id;
            return (
              <Card key={r.id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(open ? null : r.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium truncate">{r.title || 'Untitled recording'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.organizer_email || '—'}
                        {r.started_at ? ` · ${new Date(r.started_at).toLocaleString()}` : ''}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                </button>
                <RowSuggestions recordingId={r.id} />
                {open && (
                  <div className="border-t border-border p-4 bg-background/30">
                    <ClaapMappingPanel recordingId={r.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
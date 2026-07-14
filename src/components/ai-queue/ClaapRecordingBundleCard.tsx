import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, X, Loader2, Video, ExternalLink, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';
import { formatUSD } from '@/lib/formatters/currency';

interface Props {
  items: QueuedAiAction[];
  onDone?: () => void;
}

function confidenceColor(label?: string) {
  switch (label) {
    case 'high': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'medium': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Grouped Claap "Link Recordings…" card. All child items in the bundle share
 * the same top-suggested deal_id (that's how the bundle is formed upstream).
 * The user checks which recordings to link; Approve runs one upsert per
 * selected recording into `deal_claap_recordings` and marks each queue item
 * approved. Unchecked recordings stay in the queue.
 */
export function ClaapRecordingBundleCard({ items, onDone }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dealId = items[0]?.deal_id || null;
  const dealName = items[0]?.deal_name || 'this deal';

  const { data: dealMeta } = useQuery({
    queryKey: ['claap-bundle-deal-meta', dealId],
    enabled: !!dealId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: deal } = await supabase
        .from('deals')
        .select('id, value, stage, pipeline_id')
        .eq('id', dealId!)
        .maybeSingle();
      if (!deal) return null;
      let pipelineName: string | null = null;
      let stageLabel: string | null = (deal.stage as string | null) ?? null;
      if (deal.pipeline_id) {
        const { data: pipe } = await supabase
          .from('deal_pipelines')
          .select('name, stages')
          .eq('id', deal.pipeline_id)
          .maybeSingle();
        pipelineName = pipe?.name ?? null;
        if (Array.isArray(pipe?.stages)) {
          const s = (pipe!.stages as any[]).find((x) => x?.id === deal.stage);
          if (s?.label) stageLabel = s.label;
        }
      }
      return {
        pipeline: pipelineName,
        stage: stageLabel,
        amount: typeof deal.value === 'number' ? deal.value : null,
      };
    },
  });
  const dealMetaParts: string[] = [];
  if (dealMeta?.pipeline) dealMetaParts.push(dealMeta.pipeline);
  if (dealMeta?.stage) dealMetaParts.push(dealMeta.stage);
  if (dealMeta?.amount != null) dealMetaParts.push(formatUSD(dealMeta.amount));

  const rows = useMemo(() => items.map((it) => {
    const p = (it.payload || {}) as Record<string, any>;
    return {
      id: it.id,
      title: p.recording_title || it.title || 'Untitled recording',
      recordedAt: p.recorded_at as string | null,
      url: p.recording_url as string | null,
      claapId: p.claap_id as string | null,
      durationSeconds: (p.duration_seconds ?? null) as number | null,
      confidenceLabel: (p.confidence_label as string) || 'low',
      why: (p.why as string) || '',
    };
  }), [items]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected = selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const approve = async () => {
    if (!user || !dealId) return;
    if (selected.size === 0) {
      toast.error('Pick at least one recording to link.');
      return;
    }
    setBusy(true); setError(null);
    const now = new Date().toISOString();
    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      try {
        if (r.claapId) {
          const { error: linkErr } = await supabase
            .from('deal_claap_recordings')
            .upsert({
              deal_id: dealId,
              recording_id: r.claapId,
              recording_title: r.title,
              recording_url: r.url,
              duration_seconds: r.durationSeconds,
              linked_by: user.id,
              notes: 'Approved via Approval Queue (grouped)',
            }, { onConflict: 'deal_id,recording_id' });
          if (linkErr) throw linkErr;

          await supabase.from('activity_logs').insert({
            deal_id: dealId,
            activity_type: 'claap_recording_linked',
            description: `Claap recording linked via Approval Queue: ${r.title}`,
            user_id: user.id,
            metadata: { claap_id: r.claapId, source: 'approval_queue_bundle' },
          });
        }
        await supabase.from('ai_action_queue').update({
          status: 'approved', approved_at: now, executed_at: now,
        }).eq('id', r.id);
        ok++;
      } catch (e: any) {
        console.error('[ClaapRecordingBundleCard] link error', e);
        fail++;
      }
    }
    if (ok > 0) toast.success(`Linked ${ok} recording${ok !== 1 ? 's' : ''} to ${dealName}`);
    if (fail > 0) {
      setError(`${fail} recording${fail !== 1 ? 's' : ''} could not be linked. Try again.`);
      toast.error(`${fail} failed to link`);
    }
    qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
    qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
    setBusy(false);
    if (fail === 0) onDone?.();
  };

  const rejectAll = async () => {
    setBusy(true); setError(null);
    const now = new Date().toISOString();
    try {
      await supabase.from('ai_action_queue')
        .update({ status: 'dismissed', dismissed_at: now })
        .in('id', rows.map((r) => r.id));
      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-fuchsia-500/30 bg-transparent p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Video className="h-4 w-4 text-fuchsia-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Link Recordings...</p>
          <p className="text-[11px] text-muted-foreground">
            {rows.length} Claap recording{rows.length !== 1 ? 's' : ''} suggested for{' '}
            <span className="text-foreground">{dealName}</span>
            {dealMetaParts.length > 0 && (
              <span className="text-muted-foreground"> ({dealMetaParts.join(' · ')})</span>
            )}
            . Select which ones to link.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={toggleAll} disabled={busy}>
          {allSelected ? 'Clear all' : 'Select all'}
        </Button>
      </div>

      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}
            className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${
              selected.has(r.id) ? 'border-fuchsia-500/60' : 'border-border'
            }`}
          >
            <Checkbox
              checked={selected.has(r.id)}
              onCheckedChange={() => toggle(r.id)}
              disabled={busy}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium truncate">{r.title}</span>
                <Badge variant="outline" className={confidenceColor(r.confidenceLabel)}>
                  {r.confidenceLabel}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {r.recordedAt && <span>{format(new Date(r.recordedAt), 'EEE, MMM d · h:mm a')}</span>}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    <ExternalLink className="h-2.5 w-2.5" /> Open in Claap
                  </a>
                )}
              </div>
              {r.why && (
                <p className="text-[10px] text-muted-foreground italic truncate">{r.why}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" disabled={busy} onClick={rejectAll}>
          <X className="h-3 w-3 mr-1" /> Reject all
        </Button>
        <Button size="sm" variant="default" className="h-7 px-2 text-[11px]" disabled={busy || selected.size === 0 || !dealId} onClick={approve}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Link {selected.size > 0 ? selected.size : ''} recording{selected.size !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
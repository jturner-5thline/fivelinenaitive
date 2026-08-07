import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, ExternalLink, Video, X, Play, RefreshCw, ListChecks, Lightbulb, ClipboardCheck, Building2, Link2, Unlink, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FundingSourcePickerDialog } from './FundingSourcePickerDialog';
import {
  useRecordingFundingSourceLinks,
  useClaapFundingSourceLinkActions,
} from '@/hooks/useClaapFundingSourceLinks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { asStringArray, stripClaapTimestamps } from '@/types/claap';
import { transformTimestamps } from '@/components/dashboard/ClaapNoteEditor';
import { extractClientAsks } from '@/lib/claap/clientActionItems';
import { useCallOutstandingContext } from '@/hooks/useCallOutstandingContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  recordingId?: string | null;
  recordingTitle?: string | null;
  recordingUrl?: string | null;
  dealId?: string | null;
  onClose?: () => void;
}

interface Details {
  summary: string | null;
  actionItems: string[];
  keyTakeaways: string[];
  url: string | null;
  /** claap_recordings.id */
  rowId?: string | null;
  /** claap_meetings.id */
  meetingId?: string | null;
  hasTranscript?: boolean;
}

/** Same markdown typography as the End of Day Claap note renderer. */
const PROSE = cn(
  'prose prose-sm prose-invert max-w-none',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5',
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-white/95',
  '[&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-white/95 [&_h3]:tracking-wide',
  '[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-white/90',
  '[&_p]:text-xs [&_p]:leading-relaxed [&_p]:my-1.5 [&_p]:text-white/85',
  '[&_strong]:text-white [&_strong]:font-semibold',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ul]:space-y-1 [&_ul]:text-xs [&_ul]:text-white/85',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_ol]:space-y-1 [&_ol]:text-xs [&_ol]:text-white/85',
  '[&_li]:leading-snug',
  '[&_a]:text-sky-300 [&_a]:underline-offset-2',
);

function ClaapMarkdown({ source, recordingUrl }: { source: string; recordingUrl?: string | null }) {
  const rendered = useMemo(() => transformTimestamps(source, recordingUrl), [source, recordingUrl]);
  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, title, children }) =>
            title === 'claap-ts' ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center align-baseline gap-0.5 h-4 px-1 mx-0.5 rounded text-[9px] border border-emerald-500/30 text-emerald-200 bg-emerald-500/10 no-underline hover:bg-emerald-500/15"
              >
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
                {children}
              </a>
            ),
        }}
      >
        {rendered}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Read-only Claap details for a linked recording (summary, key takeaways,
 * action items) — matching the End of Day meeting card presentation.
 * Rendered inline in the Notes tab's main panel.
 */
function ClientAsksSection({
  recordingId,
  dealId,
  recordingTitle,
  actionItems,
}: {
  recordingId?: string | null;
  dealId?: string | null;
  recordingTitle?: string | null;
  actionItems: string[];
}) {
  const ctx = useCallOutstandingContext(recordingId, dealId, recordingTitle);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [requester, setRequester] = useState<string>('');
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const asks = useMemo(
    () =>
      extractClientAsks(actionItems, {
        companyName: ctx.companyName,
        dealName: ctx.dealName,
        lenderNames: ctx.lenderNames,
        internalNames: ctx.internalNames,
      }),
    [actionItems, ctx],
  );

  // Kick-off calls are requested by 5th Line; otherwise the lender on the invite.
  const defaultRequester = ctx.isKickOff ? '5th Line' : ctx.lenderOnCall || '5th Line';
  useEffect(() => { setRequester((prev) => prev || defaultRequester); }, [defaultRequester]);

  useEffect(() => {
    setLabels((prev) => {
      const next = { ...prev };
      for (const a of asks) if (next[a.raw] === undefined) next[a.raw] = a.label;
      return next;
    });
    setChecked((prev) => {
      const next = { ...prev };
      for (const a of asks) if (next[a.raw] === undefined) next[a.raw] = true;
      return next;
    });
  }, [asks]);

  const loadExisting = useCallback(async () => {
    if (!dealId) return;
    const { data } = await (supabase.from('outstanding_items') as any)
      .select('description')
      .eq('deal_id', dealId);
    setExisting(new Set((data ?? []).map((r: any) => String(r.description ?? '').trim().toLowerCase())));
  }, [dealId]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const requesterOptions = useMemo(() => {
    const opts = ['5th Line', ...ctx.lenderNames];
    return [...new Set(opts.filter(Boolean))];
  }, [ctx.lenderNames]);

  const selected = asks.filter(
    (a) => checked[a.raw] && !existing.has((labels[a.raw] ?? a.label).trim().toLowerCase()),
  );

  const handleAdd = async () => {
    if (!dealId || selected.length === 0) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { data: posRow } = await (supabase.from('outstanding_items') as any)
        .select('position')
        .eq('deal_id', dealId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      let position = (posRow?.position ?? -1) + 1;

      const status = JSON.stringify({
        received: false,
        approved: false,
        deliveredToLenders: [],
        requestedBy: [requester || defaultRequester],
      });

      const inserts = selected.map((a) => ({
        deal_id: dealId,
        description: (labels[a.raw] ?? a.label).trim(),
        status,
        user_id: userId,
        priority: 'normal',
        position: position++,
        source_metadata: {
          source: 'claap_action_item',
          recording_id: recordingId ?? null,
          raw: a.raw,
          requested_by: requester || defaultRequester,
        },
      }));

      const { error } = await (supabase.from('outstanding_items') as any).insert(inserts);
      if (error) throw error;
      toast.success(`Added ${inserts.length} outstanding item${inserts.length === 1 ? '' : 's'} for ${requester || defaultRequester}`);
      window.dispatchEvent(new CustomEvent('outstanding-items:refresh', { detail: { dealId } }));
      await loadExisting();
    } catch (err: any) {
      console.error('add outstanding items failed', err);
      toast.error(err?.message || 'Failed to add outstanding items');
    } finally {
      setSaving(false);
    }
  };

  if (!dealId || asks.length === 0) return null;

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-2.5">
      <div className="flex items-center gap-1 mb-1.5">
        <ClipboardCheck className="h-3 w-3 text-sky-300/80" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          Client asks → outstanding items
        </span>
      </div>
      <div className="space-y-1.5">
        {asks.map((a) => {
          const label = labels[a.raw] ?? a.label;
          const already = existing.has(label.trim().toLowerCase());
          return (
            <div key={a.raw} className="flex items-start gap-2">
              <Checkbox
                className="mt-1.5"
                checked={already ? false : !!checked[a.raw]}
                disabled={already}
                onCheckedChange={(v) => setChecked((p) => ({ ...p, [a.raw]: !!v }))}
              />
              <Input
                value={label}
                disabled={already}
                onChange={(e) => setLabels((p) => ({ ...p, [a.raw]: e.target.value }))}
                className="h-7 text-xs bg-white/[0.03] border-white/10"
              />
              {already && <span className="mt-1.5 shrink-0 text-[10px] text-emerald-300/80">Added</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Requester</span>
        <Select value={requester || defaultRequester} onValueChange={setRequester}>
          <SelectTrigger className="h-7 w-[220px] text-xs bg-white/[0.03] border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {requesterOptions.map((o) => (
              <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7 text-xs" disabled={saving || selected.length === 0} onClick={() => void handleAdd()}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : `Add ${selected.length || ''} to outstanding items`.trim()}
        </Button>
      </div>
    </div>
  );
}

/** Manual link / unlink of this recording to funding sources. */
function FundingSourceLinksSection({ recordingRowId }: { recordingRowId?: string | null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: links = [], isLoading } = useRecordingFundingSourceLinks(recordingRowId);
  const { unlink, relink, linkToFundingSource } = useClaapFundingSourceLinkActions();

  if (!recordingRowId) return null;

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusyId(id);
    try { await fn(); } finally { setBusyId(null); }
  };

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3 w-3 text-sky-300/80" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          Funding sources
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-[10px]"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> Link
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="mt-2 h-3 w-3 animate-spin text-muted-foreground" />
      ) : links.length === 0 ? (
        <p className="mt-1 text-xs italic text-muted-foreground">
          Not linked to a funding source yet.
        </p>
      ) : (
        <div className="mt-1.5 space-y-1">
          {links.map((l) => {
            const rejected = l.review_status === 'rejected';
            return (
              <div key={l.id} className="flex items-center gap-2">
                <span className={cn('min-w-0 flex-1 truncate text-xs', rejected && 'text-muted-foreground line-through')}>
                  {l.name}
                </span>
                <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0 h-4">
                  {l.source === 'manual' ? 'Manual' : (l.confidence ?? 0) >= 0.9 ? 'Domain match' : 'Title match'}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn('h-6 px-1.5 text-[10px]', !rejected && 'text-destructive')}
                  disabled={busyId === l.id}
                  onClick={() => void run(l.id, () => (rejected ? relink(l.id) : unlink(l.id)))}
                >
                  {busyId === l.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : rejected ? (
                    <><Link2 className="h-3 w-3 mr-1" /> Relink</>
                  ) : (
                    <><Unlink className="h-3 w-3 mr-1" /> Unlink</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <FundingSourcePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={links.filter((l) => l.review_status !== 'rejected').map((l) => l.entity_id)}
        onSelect={(lenderId, lenderName) => { void linkToFundingSource(recordingRowId, lenderId, lenderName); }}
      />
    </div>
  );
}

export function ClaapRecordingDetailsPanel({ recordingId, recordingTitle, recordingUrl, dealId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [working, setWorking] = useState(false);
  const autoTriedRef = useRef<string | null>(null);

  const load = useCallback(async (): Promise<Details | null> => {
    if (!recordingId) return null;
    const { data: rec } = await (supabase.from('claap_recordings') as any)
      .select('id, summary, action_items, key_takeaways, recording_url')
      .eq('external_id', recordingId)
      .maybeSingle();

    let next: Details = {
      summary: rec?.summary ? stripClaapTimestamps(rec.summary) : null,
      actionItems: asStringArray(rec?.action_items ?? null),
      keyTakeaways: asStringArray(rec?.key_takeaways ?? null),
      url: rec?.recording_url ?? recordingUrl ?? null,
      rowId: rec?.id ?? null,
    };

    // Fall back to the meeting row — this is what the email drafters read, so a
    // recording without a Claap-provided summary can still have AI content here.
    if (!next.summary || (!next.actionItems.length && !next.keyTakeaways.length)) {
      const { data: mtg } = await (supabase.from('claap_meetings') as any)
        .select('id, ai_summary, next_steps, key_decisions, recording_url, transcript')
        .eq('claap_id', recordingId)
        .maybeSingle();
      if (mtg) {
        next = {
          ...next,
          summary: next.summary || (mtg.ai_summary ? stripClaapTimestamps(mtg.ai_summary) : null),
          actionItems: next.actionItems.length ? next.actionItems : asStringArray(mtg.next_steps ?? null),
          keyTakeaways: next.keyTakeaways.length ? next.keyTakeaways : asStringArray(mtg.key_decisions ?? null),
          url: next.url ?? mtg.recording_url ?? null,
          meetingId: mtg.id ?? null,
          hasTranscript: Boolean(mtg.transcript && String(mtg.transcript).trim().length > 0),
        };
      }
    }
    return next;
  }, [recordingId, recordingUrl]);

  const generate = useCallback(async (target: Details, opts: { force?: boolean } = {}) => {
    setWorking(true);
    try {
      if (opts.force) {
        try {
          await supabase.functions.invoke('claap-sync-recording-content', {
            body: { recording_id: target.rowId ?? undefined, external_id: recordingId ?? undefined, priority: 'high' },
          });
        } catch (err) {
          console.warn('claap-sync-recording-content failed', err);
        }
      }
      try {
        await supabase.functions.invoke('claap-backfill-summaries', {
          body: { recording_id: target.rowId ?? undefined, meeting_id: target.meetingId ?? undefined, force: !!opts.force },
        });
      } catch (err) {
        console.warn('claap-backfill-summaries failed', err);
      }
      const refreshed = await load();
      if (refreshed) setDetails(refreshed);
      if (opts.force) toast.success('Claap notes reloaded');
    } finally {
      setWorking(false);
    }
  }, [load, recordingId]);

  useEffect(() => {
    if (!recordingId) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    (async () => {
      const next = await load();
      if (cancelled) return;
      setDetails(next);
      setLoading(false);
      // Auto-generate once when a transcript exists but no summary was ever made.
      if (next && !next.summary && next.hasTranscript && autoTriedRef.current !== recordingId) {
        autoTriedRef.current = recordingId;
        void generate(next);
      }
    })();
    return () => { cancelled = true; };
  }, [recordingId, load, generate]);

  const url = details?.url ?? recordingUrl ?? null;
  const title = recordingTitle || 'Meeting';

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
        <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] border border-emerald-500/30 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15"
            title="Open in Claap"
          >
            <Play className="h-2.5 w-2.5" /> Watch in Claap <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0" viewportClassName="pr-3 [scrollbar-gutter:stable]">
          <div className="space-y-3 p-4">
            {details && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[10px] text-white/70 hover:text-white underline disabled:opacity-60"
                  disabled={working}
                  onClick={() => { void generate(details, { force: true }); }}
                  title="Refetch transcript and regenerate Claap summary"
                >
                  {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {working ? 'Reloading…' : 'Reload Claap notes'}
                </button>
              </div>
            )}

            <FundingSourceLinksSection recordingRowId={details?.rowId} />

            <div className="rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              {details?.summary ? (
                <ClaapMarkdown source={details.summary} recordingUrl={url} />
              ) : working ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating Claap summary…
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  {details?.hasTranscript
                    ? 'Transcript is available but no summary has been generated yet — use Reload Claap notes.'
                    : 'Claap summary not yet available for this recording — generated after the call ends.'}
                </p>
              )}

              {(details?.keyTakeaways?.length ?? 0) > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                  <div className="flex items-center gap-1 mb-1">
                    <Lightbulb className="h-3 w-3 text-amber-300/80" />
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">Key takeaways</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-xs leading-snug text-white/85">
                    {details!.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                <div className="flex items-center gap-1 mb-1">
                  <ListChecks className="h-3 w-3 text-emerald-300/80" />
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">Action items</span>
                </div>
                {(details?.actionItems?.length ?? 0) > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-xs leading-snug text-white/85">
                    {details!.actionItems.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No action items captured.</p>
                )}
              </div>

              <ClientAsksSection
                recordingId={recordingId}
                dealId={dealId}
                recordingTitle={recordingTitle}
                actionItems={details?.actionItems ?? []}
              />
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

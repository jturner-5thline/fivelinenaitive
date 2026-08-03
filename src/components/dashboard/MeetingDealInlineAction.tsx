import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Briefcase, Check, ExternalLink, Link2, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { toast } from 'sonner';
import type { Deal } from '@/types/deal';
import { linkMeetingToDeal } from '@/lib/deals/linkMeetingToDeal';

interface Attendee { email?: string | null; displayName?: string | null; self?: boolean }
interface Props {
  eventId: string;
  eventTitle: string;
  eventStartISO?: string | null;
  attendees: Attendee[];
  onLinkedDeal?: (deal: { id: string; name: string }) => void;
}

interface Scored { deal: Deal; score: number; reasons: string[] }

const STOP = new Set(['the', 'and', 'with', 'for', 'a', 'to', 'of', 'in', 'on', '5th', 'line', 'inc', 'llc', 'co', 'meeting', 'call', 'sync']);
function tokens(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP.has(t)),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach(x => { if (b.has(x)) inter += 1; });
  return inter / (a.size + b.size - inter);
}
function emailDomainToken(email?: string | null): string | null {
  const m = (email || '').toLowerCase().match(/@([a-z0-9-]+)\./);
  if (!m) return null;
  const root = m[1];
  // skip generic providers
  if (['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'aol', 'proton'].includes(root)) return null;
  return root;
}

export function MeetingDealInlineAction({ eventId, eventTitle, eventStartISO, attendees, onLinkedDeal }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { deals } = useDealsContext();
  const { pipelines } = usePipelineContext();
  const qc = useQueryClient();
  const [approving, setApproving] = useState(false);
  const [userRejected, setUserRejected] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  // Existing manual/auto link for this event
  const { data: existing } = useQuery({
    queryKey: ['meeting-deal-link', eventId, company?.id],
    enabled: !!company?.id && !!eventId,
    queryFn: async () => {
      try {
        const { data } = await (supabase.from('meeting_deal_links') as any)
          .select('id, deal_id')
          .eq('org_company_id', company!.id)
          .eq('meeting_external_id', eventId)
          .is('deleted_at', null)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return data || null;
      } catch (err) {
        console.warn('meeting-deal-link query failed', err);
        return null;
      }
    },
  });

  // Client-side scoring
  const ranked: Scored | null = useMemo(() => {
    if (!deals?.length || !eventId) return null;
    const titleTokens = tokens(eventTitle);
    const attendeeDomains = new Set(
      (attendees || [])
        .filter(a => !a.self)
        .map(a => emailDomainToken(a.email))
        .filter((x): x is string => !!x),
    );
    const now = Date.now();
    let best: Scored | null = null;
    for (const deal of deals) {
      let score = 0;
      const reasons: string[] = [];
      const haystack = `${deal.name || ''} ${deal.company || ''} ${deal.lender || ''}`.toLowerCase();

      // Attendee domain match → +0.40
      let domainHit = false;
      for (const d of attendeeDomains) {
        if (d.length >= 4 && haystack.includes(d)) { domainHit = true; break; }
      }
      if (domainHit) { score += 0.40; reasons.push('Attendee domain matches deal'); }

      // Token Jaccard ≥ 0.5 → +0.25
      const dealTokens = tokens(haystack);
      const j = jaccard(titleTokens, dealTokens);
      if (j >= 0.5) { score += 0.25; reasons.push(`Title match (${Math.round(j * 100)}%)`); }
      else if (j >= 0.3) { score += 0.15; reasons.push(`Title overlap`); }

      // Recency → +0.15
      try {
        const days = differenceInCalendarDays(now, new Date(deal.updatedAt));
        if (days >= 0 && days <= 14) { score += 0.15; reasons.push('Recently active'); }
      } catch { /* ignore */ }

      if (score > (best?.score ?? 0)) best = { deal, score: Math.min(1, score), reasons };
    }
    return best && best.score >= 0.40 ? best : null;
  }, [deals, eventId, eventTitle, attendees]);

  // The linked deal may not be present in DealsContext (different pipeline,
  // filtered view, not yet hydrated). Fall back to a direct fetch so a real
  // link never renders as "not linked".
  const contextDeal = useMemo(
    () => (existing?.deal_id ? deals.find(d => d.id === existing.deal_id) || null : null),
    [existing, deals],
  );
  const { data: fetchedDeal } = useQuery({
    queryKey: ['meeting-deal-link-deal', existing?.deal_id],
    enabled: !!existing?.deal_id && !contextDeal,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, company')
        .eq('id', existing!.deal_id)
        .maybeSingle();
      if (!data) return null;
      return { id: data.id, name: (data as any).company || 'Linked deal' } as Deal;
    },
  });
  const linkedDeal = (contextDeal || fetchedDeal || null) as Deal | null;

  const band: 'linked' | 'auto' | 'review' | 'none' = useMemo(() => {
    if (linkedDeal) return 'linked';
    if (userRejected || !ranked) return 'none';
    if (ranked.score >= 0.90) return 'auto';
    if (ranked.score >= 0.65) return 'review';
    return 'none';
  }, [linkedDeal, ranked, userRejected]);

  const persistLink = async (deal: Deal, source: 'auto' | 'manual') => {
    if (!user || !company?.id) { toast.error('Workspace not ready'); return; }
    setApproving(true);
    try {
      const res = await linkMeetingToDeal({
        eventId,
        eventTitle,
        eventStartISO: eventStartISO ?? null,
        dealId: deal.id,
        dealName: deal.name,
        orgCompanyId: company.id,
        userId: user.id,
        existingLinkId: existing?.id ?? null,
      });
      toast.success(`Linked to ${deal.name}`, {
        description: [
          'Added to deal calendar & activity',
          res.claapRecordingsLinked ? `${res.claapRecordingsLinked} Claap recording(s) linked` : null,
        ].filter(Boolean).join(' · '),
      });
      onLinkedDeal?.({ id: deal.id, name: deal.name });
      qc.invalidateQueries({ queryKey: ['meeting-deal-link', eventId] });
      qc.invalidateQueries({ queryKey: ['deal-calendar-items', deal.id] });
      qc.invalidateQueries({ queryKey: ['eod-deal-linked-events'] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not link deal');
    } finally {
      setApproving(false);
    }
  };

  const matchingDeals = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return deals.slice(0, 8);
    return deals.filter(d =>
      (d.name || '').toLowerCase().includes(q) || (d.company || '').toLowerCase().includes(q),
    ).slice(0, 12);
  }, [deals, pickerQuery]);

  // Resolve "Pipeline · Stage" label so the picker shows which pipeline + stage
  // a deal lives in (helps the user avoid picking the wrong deal).
  const stageLabelFor = (d: Deal): string | null => {
    const pipeline =
      (d.pipelineId ? pipelines.find(p => p.id === d.pipelineId) : null) ||
      pipelines.find(p => p.isDefault) ||
      null;
    if (!pipeline) return null;
    const stageId = (d.stage || '') as string;
    const stage = (pipeline.stages as any[] | undefined)?.find((s) => s.id === stageId);
    const stageLabel = stage?.label || stageId || null;
    return [pipeline.name, stageLabel].filter(Boolean).join(' · ');
  };

  // Legacy CTA (no candidate)
  if (band === 'none') {
    return (
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 w-full min-w-0 justify-start gap-1.5 px-2 text-xs">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Link to deal</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2">
          <Input
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search deals…"
            className="h-7 text-xs mb-2"
          />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {matchingDeals.length === 0 ? (
              <p className="text-[11px] text-muted-foreground p-2">No deals match.</p>
            ) : matchingDeals.map(d => (
              <button
                key={d.id}
                onClick={() => { setPickerOpen(false); persistLink(d, 'manual'); }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.05] text-xs"
              >
                <div className="font-medium text-white truncate flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3 text-white/60" />{d.name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{d.company}</div>
                {stageLabelFor(d) && (
                  <div className="text-[10px] text-white/50 truncate mt-0.5">{stageLabelFor(d)}</div>
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const deal = linkedDeal || ranked!.deal;
  const scorePct = ranked ? Math.round(ranked.score * 100) : 100;
  const pill = band === 'linked' ? (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-sky-500/40 text-sky-300 bg-sky-500/10 shrink-0 whitespace-nowrap">Linked</Badge>
  ) : band === 'auto' ? (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10 shrink-0 whitespace-nowrap">
      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Auto-matched {scorePct}%
    </Badge>
  ) : (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10 shrink-0 whitespace-nowrap">
      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Suggested {scorePct}%
    </Badge>
  );

  const labelPrefix = band === 'review' ? 'Suggested: ' : '';

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5',
        band === 'auto' && 'border-emerald-500/30 bg-emerald-500/[0.05]',
        band === 'review' && 'border-amber-500/30 bg-amber-500/[0.05]',
        band === 'linked' && 'border-sky-500/30 bg-sky-500/[0.05]',
      )}
    >
      <a
        href={`/deals?deal=${deal.id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 min-w-0 basis-full sm:basis-0 sm:flex-1 text-xs text-white hover:underline"
        title={deal.name}
      >
        <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">▶ {labelPrefix}{deal.name}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
      </a>
      <div className="flex items-center flex-wrap gap-1.5 shrink-0 ml-auto">
        {pill}
        {band === 'auto' && (
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2 text-[10px] gap-1 shrink-0 whitespace-nowrap text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10"
            disabled={approving}
            onClick={() => persistLink(ranked!.deal, 'auto')}
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
          </Button>
        )}
        {band === 'review' && (
          <>
            <Button
              size="sm" variant="ghost"
              className="h-7 px-2 text-[10px] gap-1 shrink-0 whitespace-nowrap text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10"
              disabled={approving}
              onClick={() => persistLink(ranked!.deal, 'manual')}
            >
              {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
            </Button>
            <Button
              size="sm" variant="ghost"
              className="h-7 px-2 text-[10px] gap-1 shrink-0 whitespace-nowrap text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"
              onClick={() => setUserRejected(true)}
            >
              <X className="h-3 w-3" /> Reject
            </Button>
          </>
        )}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm" variant="ghost"
              className="h-7 px-2 text-[10px] gap-1 shrink-0 whitespace-nowrap text-white/80 hover:text-white hover:bg-white/[0.08]"
            >
              <Pencil className="h-3 w-3" /> Change
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2">
            <Input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search deals…"
              className="h-7 text-xs mb-2"
            />
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {matchingDeals.map(d => (
                <button
                  key={d.id}
                  onClick={() => { setPickerOpen(false); persistLink(d, 'manual'); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.05] text-xs"
                >
                  <div className="font-medium text-white truncate">{d.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{d.company}</div>
                  {stageLabelFor(d) && (
                    <div className="text-[10px] text-white/50 truncate mt-0.5">{stageLabelFor(d)}</div>
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
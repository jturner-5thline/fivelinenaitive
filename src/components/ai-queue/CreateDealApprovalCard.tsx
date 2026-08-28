/**
 * CreateDealApprovalCard — Approval Queue detail card for
 * `action_type === 'create_new_deal'` items produced by the Deal Admin
 * Agent's post-sales-call detector (see edge function
 * detect-sales-call-deals). The user can review the AI-drafted fields,
 * open the standard Create Deal dialog prefilled, edit anything, and hit
 * Create Deal to finalize. On successful create the queue item is marked
 * approved.
 */
import { useState, useEffect, useRef } from 'react';
import { Video, Calendar, Building2, Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { LinkClaapRecordingPopover, type ClaapMatchCandidate } from './LinkClaapRecordingPopover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';



function findNdaStageId(stages: Array<{ id: string; label: string }>): string {
  const match = stages.find((s) => {
    const n = (s.label || '').toLowerCase().replace(/[^a-z]/g, '');
    return n.includes('nda') && n.includes('needslist');
  });
  return match?.id || '';
}

interface Props {
  item: QueuedAiAction;
}

export function CreateDealApprovalCard({ item }: Props) {
  const payload = (item.payload ?? {}) as Record<string, any>;
  const source = (item.source ?? {}) as Record<string, any>;
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { activePipeline } = usePipelineContext();
  const { stages: globalStages } = useDealStages();
  const stageList = (activePipeline?.stages?.length ? activePipeline.stages : globalStages) as Array<{ id: string; label: string }>;
  const defaultNdaStageId = findNdaStageId(stageList);
  const [selectedStageId, setSelectedStageId] = useState<string>(payload.dealStage || defaultNdaStageId || '');

  // The queue item is drafted right after the call, often before the Claap
  // recording has synced — so `source.claap_meeting_id` can be empty even
  // though a matching meeting exists. Resolve it live by title/start time.
  const eventTitle: string = source.event_title || '';
  const eventStart: string | null = source.event_start || null;
  const { data: fallbackMeeting } = useQuery({
    queryKey: ['create-deal-claap-fallback', item.id, eventTitle, eventStart],
    enabled: !source.claap_meeting_id && !!eventTitle,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('claap_meetings')
        .select('id, claap_id, title, started_at, recording_url')
        .ilike('title', eventTitle.trim())
        .order('started_at', { ascending: false })
        .limit(1);
      if (eventStart) {
        const t = new Date(eventStart).getTime();
        q = q
          .gte('started_at', new Date(t - 12 * 60 * 60 * 1000).toISOString())
          .lte('started_at', new Date(t + 12 * 60 * 60 * 1000).toISOString());
      }
      const { data } = await q.maybeSingle();
      return data ?? null;
    },
  });
  // Manual link (user picked a recording by hand) wins over auto-resolution.
  const [manualMatch, setManualMatch] = useState<ClaapMatchCandidate | null>(null);
  const matchedClaapTitle: string | null = manualMatch
    ? manualMatch.title
    : source.claap_meeting_id
      ? (source.claap_meeting_title || null)
      : (fallbackMeeting?.title ?? null);
  const hasClaapMatch = !!manualMatch || !!source.claap_meeting_id || !!fallbackMeeting;

  async function linkClaapCandidate(candidate: ClaapMatchCandidate) {
    const nextSource = {
      ...source,
      claap_meeting_title: candidate.title,
      ...(candidate.kind === 'meeting'
        ? { claap_meeting_id: candidate.id }
        : { claap_recording_id: candidate.id }),
      claap_linked_manually: true,
    };
    const { error } = await supabase
      .from('ai_action_queue')
      .update({ source: nextSource as never })
      .eq('id', item.id);
    if (error) throw error;
    setManualMatch(candidate);
    qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
    toast.success(`Linked “${candidate.title}”`);
    autoDrafted.current = true;
    await draftFromClaap(true, candidate);
  }


  // The narrative (and other AI-drafted fields) are only filled by the
  // detector when a Claap recording existed at sweep time. When the
  // recording syncs later the payload stays blank — so draft it on demand
  // here as soon as a recording is resolvable.
  const [drafting, setDrafting] = useState(false);
  const autoDrafted = useRef(false);

  async function draftFromClaap(manual = false, candidate?: ClaapMatchCandidate | null) {
    if (drafting) return;
    setDrafting(true);
    try {
      const picked = candidate ?? manualMatch;
      const { data, error } = await supabase.functions.invoke('draft-deal-from-claap', {
        body: {
          queue_id: item.id,
          claap_meeting_id:
            (picked?.kind === 'meeting' ? picked.id : null) ||
            source.claap_meeting_id ||
            fallbackMeeting?.id ||
            null,
          claap_recording_id: picked?.kind === 'recording' ? picked.id : source.claap_recording_id || null,
        },
      });

      if (error) throw error;
      if ((data as any)?.ok) {
        qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
        if (manual) toast.success('Drafted deal details from the Claap recording');
      } else if (manual) {
        const reason = (data as any)?.reason;
        toast.error(
          reason === 'no_transcript'
            ? 'That recording has no transcript or summary synced yet'
            : 'Could not draft from the recording',
        );
      }
    } catch (e: any) {
      if (manual) toast.error(e?.message || 'Could not draft from the recording');
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    if (autoDrafted.current) return;
    if (payload.narrative) return;
    if (!hasClaapMatch) return;
    autoDrafted.current = true;
    void draftFromClaap(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasClaapMatch, payload.narrative]);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Company / Deal name', value: payload.dealName || source.company_name || '—' },
    { label: 'Deal amount', value: payload.dealAmount ? `$${Number(payload.dealAmount).toLocaleString()}` : '—' },
    { label: 'Client contact', value: payload.contactName || payload.contactInfo || '—' },
    { label: 'Client email', value: payload.contactInfo || '—' },
    ...(Array.isArray(payload.additionalContactEmails) && payload.additionalContactEmails.length
      ? [{ label: 'Other attendees', value: (payload.additionalContactEmails as string[]).join(', ') }]
      : []),
    { label: 'Deal status', value: payload.dealStatusNote || '—' },
    { label: 'Narrative', value: payload.narrative || (drafting ? 'Drafting from the recording…' : '—') },
    { label: 'Referred by', value: payload.referralName || '—' },
  ];

  const initialValues = {
    dealName: payload.dealName || source.company_name || '',
    dealAmount: payload.dealAmount || '',
    contactName: payload.contactName || '',
    contactInfo: payload.contactInfo || '',
    additionalContactEmails: Array.isArray(payload.additionalContactEmails)
      ? (payload.additionalContactEmails as string[])
      : [],

    dealStatusNote: payload.dealStatusNote || '',
    narrative: payload.narrative || '',
    referralName: payload.referralName || '',
    referralEmail: payload.referralEmail || '',
    dealClass: (payload.dealClass || 'standard') as 'standard' | 'naitive' | 'finserv',
    dealStage: selectedStageId || payload.dealStage || defaultNdaStageId || '',
  };

  async function markApproved(newDealId: string) {
    try {
      const now = new Date().toISOString();
      // Backdate the deal's created_at and initial stage-history entry to the
      // sales call date so "Created" and "Entered <stage>" reflect when the
      // call actually happened, not when the approver clicked Create.
      const callDate = source.event_start || source.event_end || null;
      if (callDate) {
        try {
          await supabase.from('deals').update({ created_at: callDate }).eq('id', newDealId);
          await supabase
            .from('deal_stage_history')
            .update({ changed_at: callDate })
            .eq('deal_id', newDealId);
        } catch (e: any) {
          console.warn('[CreateDealApprovalCard] backdate to call date failed', e?.message);
        }
      }
      // Auto-create a follow-up task for the deal manager so a new deal
      // never sits without a next action. Non-fatal on failure.
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        const { data: deal } = await supabase
          .from('deals')
          .select('company, manager, company_id')
          .eq('id', newDealId)
          .maybeSingle();
        const dealName = (deal?.company as string | null) || payload.dealName || source.company_name || 'New Deal';
        const assignee = (deal?.manager as string | null) || userId || null;
        if (assignee && userId) {
          await supabase.from('tasks').insert({
            title: `Follow Up on ${dealName} - Needs Items`,
            assigned_to: assignee,
            assigned_by: userId,
            deal_id: newDealId,
            company_id: (deal?.company_id as string | null) ?? null,
            status: 'not_started',
          } as never);
        }
      } catch (e: any) {
        console.warn('[CreateDealApprovalCard] auto follow-up task failed', e?.message);
      }
      await supabase
        .from('ai_action_queue')
        .update({
          status: 'approved',
          approved_at: now,
          executed_at: now,
          execution_result: { deal_id: newDealId, created_via: 'create_deal_dialog', backdated_to: callDate },
        })
        .eq('id', item.id);
      qc.invalidateQueries({ queryKey: ['ai-action-queue'] });
      qc.invalidateQueries({ queryKey: ['ai-action-queue-count'] });
      toast.success('New deal created and item cleared from Approval Queue');
    } catch (e: any) {
      console.warn('[CreateDealApprovalCard] mark approved failed', e?.message);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="rounded-md border border-white/[0.14] bg-white/[0.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-[13px] text-[#ecedf4] w-fit">
                  <Sparkles className="h-3.5 w-3.5 text-[#5ecdf5]" />
                  <span className="font-medium cursor-default">{item.title}</span>
                </div>
              </TooltipTrigger>
              {item.description ? (
                <TooltipContent side="bottom" align="start" className="max-w-sm text-xs leading-relaxed">
                  {item.description}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>

          <Button variant="gradient" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
            Review &amp; Create Deal
          </Button>
        </div>



        <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-[#ecedf4]/55">
          {source.event_title ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {source.event_title}
            </span>
          ) : null}
          {hasClaapMatch ? (
            <span className="inline-flex items-center gap-1">
              <Video className="h-3 w-3" />
              {matchedClaapTitle ? `Claap: ${matchedClaapTitle}` : 'Claap recording matched'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-300/80">
              <Video className="h-3 w-3" />
              No Claap recording matched yet
            </span>
          )}
          {source.company_name ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {source.company_name}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-white/[0.14] bg-white/[0.03] divide-y divide-white/[0.08]">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2 text-xs">
            <div className="text-[#ecedf4]/55 uppercase tracking-wide text-[10px] pt-0.5">{r.label}</div>
            <div className="text-[#ecedf4]/90 whitespace-pre-wrap break-words">{r.value}</div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[#ecedf4]/50">
        Review the drafted fields. Click <span className="text-[#ecedf4]/80">Review &amp; Create Deal</span> to open the standard Create Deal form pre-filled from the call — you can edit any field before finalizing.
      </p>

      <div className="rounded-md border border-white/[0.14] bg-white/[0.03] p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-[#ecedf4]/55">Pipeline stage</div>
        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger className="h-8 bg-white/[0.04] border-white/[0.14] text-xs text-[#ecedf4]">
            <SelectValue placeholder="Select a stage" />
          </SelectTrigger>
          <SelectContent>
            {stageList.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-[#ecedf4]/45">
          Defaults to “NDA / Needs List Sent”. Change here to override before approving.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <LinkClaapRecordingPopover
          defaultQuery={source.company_name || source.event_title || ''}
          label={hasClaapMatch ? 'Change Claap recording' : 'Link Claap recording'}
          onLink={linkClaapCandidate}
        />

        <Button
          variant="gradient"
          onClick={() => setOpen(true)}
        >
          Review &amp; Create Deal
        </Button>
        {hasClaapMatch ? (
          <Button variant="outline" disabled={drafting} onClick={() => void draftFromClaap(true)}>
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {payload.narrative ? 'Re-draft from recording' : 'Draft from recording'}
          </Button>
        ) : null}
      </div>

      {open ? (
        <CreateDealDialog
          // Keyed on the drafted payload so the form always initializes from
          // the values currently shown in the approval card (narrative and
          // deal status are drafted asynchronously after this card mounts).
          key={`${item.id}:${initialValues.dealStatusNote}:${initialValues.narrative}:${initialValues.dealStage}`}
          open={open}
          onOpenChange={setOpen}
          initialValues={{
            ...initialValues,
            onCreated: (dealId) => {
              setOpen(false);
              void markApproved(dealId);
            },
            onDismiss: () => setOpen(false),
          }}
        />
      ) : null}

    </div>
  );
}
/**
 * CreateDealApprovalCard — Approval Queue detail card for
 * `action_type === 'create_new_deal'` items produced by the Deal Admin
 * Agent's post-sales-call detector (see edge function
 * detect-sales-call-deals). The user can review the AI-drafted fields,
 * open the standard Create Deal dialog prefilled, edit anything, and hit
 * Create Deal to finalize. On successful create the queue item is marked
 * approved.
 */
import { useState } from 'react';
import { Video, Calendar, Building2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import type { QueuedAiAction } from '@/hooks/useAiActionQueue';
import { useQueryClient } from '@tanstack/react-query';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';

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

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Company / Deal name', value: payload.dealName || source.company_name || '—' },
    { label: 'Deal amount', value: payload.dealAmount ? `$${Number(payload.dealAmount).toLocaleString()}` : '—' },
    { label: 'Client contact', value: payload.contactName || payload.contactInfo || '—' },
    { label: 'Client email', value: payload.contactInfo || '—' },
    ...(Array.isArray(payload.additionalContactEmails) && payload.additionalContactEmails.length
      ? [{ label: 'Other attendees', value: (payload.additionalContactEmails as string[]).join(', ') }]
      : []),
    { label: 'Deal status', value: payload.dealStatusNote || '—' },
    { label: 'Narrative', value: payload.narrative || '—' },
    { label: 'Referred by', value: payload.referralName || '—' },
  ];

  const initialValues = {
    dealName: payload.dealName || source.company_name || '',
    dealAmount: payload.dealAmount || '',
    contactName: payload.contactName || '',
    contactInfo: payload.contactInfo || '',
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
        <div className="flex items-center gap-2 text-[13px] text-[#ecedf4]">
          <Sparkles className="h-3.5 w-3.5 text-[#5ecdf5]" />
          <span className="font-medium">{item.title}</span>
        </div>
        {item.description ? (
          <p className="mt-1.5 text-xs text-[#ecedf4]/65 leading-relaxed">{item.description}</p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-[#ecedf4]/55">
          {source.event_title ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {source.event_title}
            </span>
          ) : null}
          {source.claap_meeting_id ? (
            <span className="inline-flex items-center gap-1">
              <Video className="h-3 w-3" />
              Claap recording matched
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

      <div className="flex gap-2">
        <Button
          variant="gradient"
          onClick={() => setOpen(true)}
        >
          Review &amp; Create Deal
        </Button>
      </div>

      <CreateDealDialog
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
    </div>
  );
}
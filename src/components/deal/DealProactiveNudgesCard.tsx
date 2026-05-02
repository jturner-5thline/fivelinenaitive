import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Clock,
  FileWarning,
  Mail,
  Calendar,
  Hourglass,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NudgeKind =
  | 'status_update'
  | 'outstanding_overdue'
  | 'documents_missing'
  | 'lender_stale'
  | 'milestone_approaching'
  | 'stage_stale';

interface Nudge {
  id: string; // stable per nudge type for dismissal
  kind: NudgeKind;
  title: string;
  prompt: string; // text inserted into the chat input on click
  meta?: Record<string, any>;
}

const ICON_MAP: Record<NudgeKind, typeof Clock> = {
  status_update: Clock,
  outstanding_overdue: AlertCircle,
  documents_missing: FileWarning,
  lender_stale: Mail,
  milestone_approaching: Calendar,
  stage_stale: Hourglass,
};

const DISMISS_HOURS = 24;
const dismissKey = (dealId: string) => `deal-nudges-dismissed:${dealId}`;

function loadDismissed(dealId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(dismissKey(dealId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - DISMISS_HOURS * 3_600_000;
    const fresh: Record<string, number> = {};
    for (const [k, t] of Object.entries(parsed)) if (t > cutoff) fresh[k] = t;
    return fresh;
  } catch {
    return {};
  }
}

function saveDismissed(dealId: string, map: Record<string, number>) {
  try { localStorage.setItem(dismissKey(dealId), JSON.stringify(map)); } catch { /* ignore */ }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const due = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

const ACTIVE_STATUSES = new Set(['on-track', 'at-risk', 'off-track', 'active']);

// Stages we treat as "late" for the document-completeness nudge
const LATE_STAGE_REGEX = /(due diligence|final credit|terms issued|agreement pending|funding|funded|closing)/i;

const STALE_LENDER_STAGES = new Set([
  'submitted', 'in review', 'in-review', 'under review', 'reviewing',
]);

interface UseDealNudgesResult {
  nudges: Nudge[];
  isLoading: boolean;
}

function useDealNudges(dealId: string): UseDealNudgesResult {
  const { data, isLoading } = useQuery({
    queryKey: ['deal-nudges', dealId],
    enabled: !!dealId,
    staleTime: 60_000,
    queryFn: async () => {
      const [
        dealRes,
        lastStatusNoteRes,
        outstandingRes,
        docItemsRes,
        docStatusRes,
        lendersRes,
        milestonesRes,
        stageChangeRes,
      ] = await Promise.all([
        supabase.from('deals')
          .select('id, company, stage, status, updated_at')
          .eq('id', dealId)
          .maybeSingle(),
        supabase.from('deal_status_notes')
          .select('created_at')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('outstanding_items')
          .select('id, description, assigned_to, due_date, status')
          .eq('deal_id', dealId)
          .neq('status', 'completed'),
        supabase.from('deal_checklist_items')
          .select('id, name, is_required')
          .eq('deal_id', dealId)
          .eq('is_required', true),
        supabase.from('deal_checklist_status')
          .select('deal_checklist_item_id, checklist_item_id, is_complete')
          .eq('deal_id', dealId)
          .eq('is_complete', true),
        supabase.from('deal_lenders')
          .select('id, name, stage, updated_at, created_at')
          .eq('deal_id', dealId),
        supabase.from('deal_milestones')
          .select('id, title, due_date, completed')
          .eq('deal_id', dealId)
          .eq('completed', false),
        supabase.from('activity_logs')
          .select('created_at')
          .eq('deal_id', dealId)
          .eq('activity_type', 'stage_change')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        deal: dealRes.data,
        lastStatusNoteAt: lastStatusNoteRes.data?.created_at as string | null | undefined,
        outstanding: outstandingRes.data || [],
        requiredItems: docItemsRes.data || [],
        completedStatuses: docStatusRes.data || [],
        lenders: lendersRes.data || [],
        milestones: milestonesRes.data || [],
        lastStageChangeAt: stageChangeRes.data?.created_at as string | null | undefined,
      };
    },
  });

  const nudges = useMemo<Nudge[]>(() => {
    if (!data?.deal) return [];
    const out: Nudge[] = [];
    const deal = data.deal as any;
    const dealName = deal.company || 'this deal';
    const isActive = ACTIVE_STATUSES.has(String(deal.status || '').toLowerCase());

    // 1. Status update needed
    if (isActive) {
      const days = daysSince(data.lastStatusNoteAt) ?? daysSince(deal.updated_at);
      if (days !== null && days > 5) {
        out.push({
          id: 'status_update',
          kind: 'status_update',
          title: `The last status note on this deal was ${days} days ago. Do you want to draft a status update to send to the client?`,
          prompt: `Draft a status update on ${dealName} that I can send to the client. Summarize lender activity, recent progress, and what's next.`,
        });
      }
    }

    // 2. Outstanding items overdue or unassigned
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const problemItems = (data.outstanding || []).filter((it: any) => {
      if (!it.assigned_to) return true;
      if (!it.due_date) return true;
      const d = new Date(it.due_date + (String(it.due_date).length === 10 ? 'T00:00:00' : ''));
      return d.getTime() < today.getTime();
    });
    if (problemItems.length > 0) {
      out.push({
        id: 'outstanding_overdue',
        kind: 'outstanding_overdue',
        title: `This deal has ${problemItems.length} outstanding ${problemItems.length === 1 ? 'item' : 'items'} that are overdue or have no due date. Want to review and assign them?`,
        prompt: `Review the outstanding items on ${dealName} that are overdue or unassigned, and suggest who should own each one and a target due date.`,
        meta: { count: problemItems.length },
      });
    }

    // 3. Document completeness
    const completedItemIds = new Set<string>();
    for (const s of data.completedStatuses as any[]) {
      if (s.deal_checklist_item_id) completedItemIds.add(s.deal_checklist_item_id);
      if (s.checklist_item_id) completedItemIds.add(s.checklist_item_id);
    }
    const missingRequired = (data.requiredItems as any[]).filter((it) => !completedItemIds.has(it.id));
    const stageIsLate = LATE_STAGE_REGEX.test(String(deal.stage || ''));
    const milestoneSoon = (data.milestones as any[]).some((m) => {
      const du = daysUntil(m.due_date);
      return du !== null && du >= 0 && du <= 5;
    });
    if (missingRequired.length > 0 && (stageIsLate || milestoneSoon)) {
      const sample = missingRequired.slice(0, 8).map((m) => `- ${m.name}`).join('\n');
      out.push({
        id: 'documents_missing',
        kind: 'documents_missing',
        title: `This deal has ${missingRequired.length} required ${missingRequired.length === 1 ? 'document' : 'documents'} missing from the Data Room. Before advancing to the next stage, ${missingRequired.length === 1 ? 'it should be' : 'these should be'} collected. Want me to draft a document request to the client?`,
        prompt: `Draft a professional email to the primary deal contact on ${dealName} requesting the following missing documents:\n${sample}\n\nKeep it concise, list each document as a bullet, and offer to schedule a quick call if anything is unclear.`,
        meta: { count: missingRequired.length },
      });
    }

    // 4. Lender hasn't responded
    const staleLender = (data.lenders as any[])
      .map((l) => {
        const stage = String(l.stage || '').toLowerCase();
        if (!STALE_LENDER_STAGES.has(stage)) return null;
        const days = daysSince(l.updated_at || l.created_at);
        if (days === null || days < 7) return null;
        return { ...l, days };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.days - a.days)[0] as any;
    if (staleLender) {
      out.push({
        id: `lender_stale:${staleLender.id}`,
        kind: 'lender_stale',
        title: `${staleLender.name} hasn't responded in ${staleLender.days} days on this deal. Want me to draft a follow-up?`,
        prompt: `Draft a polite follow-up email to ${staleLender.name} on ${dealName}. They've been at "${staleLender.stage}" for ${staleLender.days} days with no response. Ask for an update on timing and any open questions.`,
      });
    }

    // 5. Milestone approaching with open items
    const upcomingMilestone = (data.milestones as any[])
      .map((m) => ({ ...m, daysUntil: daysUntil(m.due_date) }))
      .filter((m) => m.daysUntil !== null && m.daysUntil >= 0 && m.daysUntil <= 5)
      .sort((a, b) => (a.daysUntil ?? 99) - (b.daysUntil ?? 99))[0];
    const openItemCount = (data.outstanding as any[]).length;
    if (upcomingMilestone && openItemCount > 0) {
      out.push({
        id: `milestone:${upcomingMilestone.id}`,
        kind: 'milestone_approaching',
        title: `The ${upcomingMilestone.title} milestone is in ${upcomingMilestone.daysUntil} ${upcomingMilestone.daysUntil === 1 ? 'day' : 'days'} and ${openItemCount} outstanding ${openItemCount === 1 ? 'item is' : 'items are'} still open. Flag for review?`,
        prompt: `The "${upcomingMilestone.title}" milestone on ${dealName} is in ${upcomingMilestone.daysUntil} day(s) with ${openItemCount} open outstanding item(s). List which items are most likely to block the milestone and what action I should take this week.`,
      });
    }

    // 6. Deal stage stale
    const stageDays = daysSince(data.lastStageChangeAt) ?? daysSince(deal.updated_at);
    if (isActive && stageDays !== null && stageDays > 14 && deal.stage) {
      out.push({
        id: 'stage_stale',
        kind: 'stage_stale',
        title: `This deal has been in ${deal.stage} for ${stageDays} days. Is there an update to log?`,
        prompt: `${dealName} has been in stage "${deal.stage}" for ${stageDays} days. Help me log a status update — what should I include given the recent activity, lender progress, and outstanding items?`,
      });
    }

    return out;
  }, [data]);

  return { nudges, isLoading: isLoading };
}

interface DealProactiveNudgesCardProps {
  dealId: string;
  /** Triggered when the user clicks a nudge. The string is a draft prompt to seed the chat. */
  onAction: (prompt: string, kind: NudgeKind) => void;
  /** Hide the card entirely (e.g. once a conversation has started). */
  hidden?: boolean;
}

export function DealProactiveNudgesCard({ dealId, onAction, hidden }: DealProactiveNudgesCardProps) {
  const { nudges, isLoading } = useDealNudges(dealId);
  const [dismissed, setDismissed] = useState<Record<string, number>>(() => loadDismissed(dealId));

  // Refresh dismissed map when deal changes
  useEffect(() => { setDismissed(loadDismissed(dealId)); }, [dealId]);

  if (hidden) return null;
  if (isLoading) return null;

  const visible = nudges.filter((n) => !dismissed[n.id]).slice(0, 3);
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = { ...dismissed, [id]: Date.now() };
    setDismissed(next);
    saveDismissed(dealId, next);
  };

  return (
    <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Before you ask — here's what I noticed:
      </div>
      <div className="space-y-1.5">
        {visible.map((n) => {
          const Icon = ICON_MAP[n.kind];
          return (
            <div
              key={n.id}
              className={cn(
                'group flex items-start gap-2 rounded-md border border-border/50 bg-background/60 p-2 text-sm',
                'hover:bg-background hover:border-border transition-colors',
              )}
            >
              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => onAction(n.prompt, n.kind)}
                className="flex-1 text-left leading-snug hover:text-primary transition-colors"
              >
                {n.title}
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss for 24 hours"
                className="h-6 w-6 flex-shrink-0 opacity-50 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
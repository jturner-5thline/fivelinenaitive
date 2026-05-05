import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { getDailyBriefingWindow } from '@/utils/dailyBriefingWindow';
import { useCompany } from '@/hooks/useCompany';

// ── Shared window (memoized) ──────────────────────────────────
export function useBriefingWindow() {
  return useMemo(() => getDailyBriefingWindow('interactive'), []);
}

// ── Active Pipeline resolver ──────────────────────────────────
// Resolves the company's default ("Active") pipeline id. Used to gate the
// Deal Rundown / Daily Briefing surfaces so only deals currently in the
// Active Pipeline appear.
export function useActivePipelineId(): string | null {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const { data } = useQuery({
    queryKey: ['briefing', 'active-pipeline-id', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
    },
  });
  return data ?? null;
}

// Shared rundown eligibility: deal must be in the Active Pipeline AND not
// Archived AND not On Hold. Used by Deal Rundown, Daily Briefing, and
// Niki's Daily Briefing so all three surfaces stay in sync.
const RUNDOWN_SUPPRESSED_STATUSES = new Set(['archived', 'on-hold', 'on_hold']);
export function filterRundownEligibleDeals<T extends { status?: string | null; pipelineId?: string | null }>(
  deals: T[],
  activePipelineId: string | null,
): T[] {
  if (!activePipelineId) return [];
  return deals.filter(d => {
    if ((d as any).pipelineId !== activePipelineId) return false;
    const status = (d.status || '').toString().toLowerCase();
    if (RUNDOWN_SUPPRESSED_STATUSES.has(status)) return false;
    return true;
  });
}

// ── Deal scoping helper ───────────────────────────────────────
// Returns deals where the named user is the Deal Owner OR Deal Manager.
// In the Naitive schema both `deal_owner` and `manager` are text columns
// holding the display name (e.g., "Niki Heikali"). Comparison is
// case-insensitive and trims whitespace. Dedupe is implicit (single array).
export function getDealsForUserName(
  allDeals: any[],
  userDisplayName: string,
  roles: Array<'owner' | 'manager'> = ['owner', 'manager'],
): any[] {
  if (!userDisplayName) return [];
  const target = userDisplayName.trim().toLowerCase();
  return allDeals.filter(d => {
    const owner = (d.deal_owner || d.dealOwner || '').toString().trim().toLowerCase();
    const manager = (d.manager || '').toString().trim().toLowerCase();
    if (roles.includes('owner') && owner === target) return true;
    if (roles.includes('manager') && manager === target) return true;
    return false;
  });
}

// ── Catch Up tab data ─────────────────────────────────────────
export interface NewsItem {
  id: string;
  category: 'pipeline' | 'email' | 'risk' | 'milestone' | 'general';
  title: string;
  summary: string;
  timestamp: string;
  action?: { label: string; path: string };
  meta?: Record<string, any>;
}

export function useCatchUpData(enabled: boolean, targetDealOwnerName?: string) {
  const { user } = useAuth();
  const { deals: allDeals } = useDealsContext();
  const window = useBriefingWindow();
  const activePipelineId = useActivePipelineId();

  // When delegated (targetDealOwnerName set), narrow the deal set to deals
  // where that user is Owner OR Manager. This narrows every downstream
  // section: highlights, news items, risk deals, milestones, etc.
  const deals = useMemo(() => {
    const scoped = targetDealOwnerName ? getDealsForUserName(allDeals, targetDealOwnerName) : allDeals;
    return filterRundownEligibleDeals(scoped as any[], activePipelineId);
  }, [allDeals, targetDealOwnerName, activePipelineId]);
  const dealIdSet = useMemo(() => new Set(deals.map(d => d.id)), [deals]);
  const isDelegated = !!targetDealOwnerName;

  return useQuery({
    queryKey: ['briefing-catchup', window.startISO, user?.id, isDelegated ? `for:${targetDealOwnerName}` : 'self'],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;

      const [activityRes, stageChangeRes, milestonesRes, emailCacheRes, emailAnalysisRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, user_display_name, created_at, metadata')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, created_at, metadata')
          .in('activity_type', ['stage_change', 'lender_stage_change', 'deal_created'])
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('deal_milestones')
          .select('id, deal_id, title, status, due_date, completed')
          .eq('completed', false)
          .limit(50),
        supabase
          .from('email_cache')
          .select('id, gmail_message_id, thread_id, subject, snippet, from_email, from_name, received_at, is_read, labels')
          .eq('user_id', user!.id)
          .gte('received_at', startISO)
          .lte('received_at', endISO)
          .order('received_at', { ascending: false })
          .limit(50),
        supabase
          .from('email_analysis')
          .select('email_cache_id, category, sentiment, priority, summary, deal_name, follow_up_needed')
          .gte('analyzed_at', startISO)
          .limit(200),
      ]);

      // When delegated, scope all deal-bound activity/milestones to the
      // target user's deals (Owner OR Manager). Email content is intentionally
      // NOT mixed in for delegated mode — Niki's email surfaces only via the
      // dedicated Email tab (handled by useEmailData with its own auth path).
      const rawActivities = activityRes.data || [];
      const rawStageChanges = stageChangeRes.data || [];
      const rawMilestones = milestonesRes.data || [];
      const activities = isDelegated
        ? rawActivities.filter(a => !a.deal_id || dealIdSet.has(a.deal_id))
        : rawActivities;
      const stageChanges = isDelegated
        ? rawStageChanges.filter(sc => !sc.deal_id || dealIdSet.has(sc.deal_id))
        : rawStageChanges;
      const milestones = isDelegated
        ? rawMilestones.filter(m => !m.deal_id || dealIdSet.has(m.deal_id))
        : rawMilestones;
      const emailCache = isDelegated ? [] : (emailCacheRes.data || []);
      const emailAnalysis = isDelegated ? [] : (emailAnalysisRes.data || []);
      const analysisMap = new Map(emailAnalysis.map(a => [a.email_cache_id, a]));

      // Priority alerts (unchanged)
      const alerts = activities
        .filter(a => {
          const meta = a.metadata as any;
          return meta?.priority === 'high' || a.activity_type === 'flex_info_request';
        })
        .slice(0, 10);

      // Summary highlights (unchanged)
      const newDealCount = stageChanges.filter(sc => sc.activity_type === 'deal_created').length;
      const stageCount = stageChanges.filter(sc => sc.activity_type !== 'deal_created').length;
      const suppressedStatuses = ['archived', 'on-hold', 'on_hold'];
      const activeDeals = deals.filter(d => !suppressedStatuses.includes((d.status || '').toLowerCase()));
      const riskCount = activeDeals.filter(d => d.isFlagged).length;
      const overdueCount = milestones.filter(m => m.due_date && new Date(m.due_date) < new Date()).length;

      const highlights: { label: string; value: string }[] = [];
      if (newDealCount > 0) highlights.push({ label: 'New Deals', value: `${newDealCount} new opportunit${newDealCount === 1 ? 'y' : 'ies'} added` });
      if (stageCount > 0) highlights.push({ label: 'Pipeline Movement', value: `${stageCount} stage changes` });
      if (riskCount > 0) highlights.push({ label: 'Attention Needed', value: `${riskCount} deal${riskCount === 1 ? '' : 's'} flagged or at risk` });
      if (overdueCount > 0) highlights.push({ label: 'Overdue Tasks', value: `${overdueCount} milestone${overdueCount === 1 ? '' : 's'} overdue` });

      // ── Build news items from existing data ──
      const newsItems: NewsItem[] = [];

      // 1. Notable stage changes (top 5)
      const notableStageChanges = stageChanges
        .filter(sc => sc.activity_type !== 'deal_created')
        .slice(0, 5);
      for (const sc of notableStageChanges) {
        const meta = sc.metadata as any;
        const dealName = deals.find(d => d.id === sc.deal_id)?.company || 'Unknown Deal';
        const fromStage = meta?.from || 'previous stage';
        const toStage = meta?.to || 'new stage';
        const lenderName = meta?.lender_name;
        newsItems.push({
          id: `sc-${sc.id}`,
          category: 'pipeline',
          title: lenderName
            ? `${lenderName} moved to ${toStage} on ${dealName}`
            : `${dealName} moved to ${toStage}`,
          summary: `Stage changed from ${fromStage} to ${toStage}${lenderName ? ` (lender: ${lenderName})` : ''}`,
          timestamp: sc.created_at,
          action: sc.deal_id ? { label: 'Open Deal', path: `/deal/${sc.deal_id}` } : undefined,
          meta: { deal_id: sc.deal_id, ...meta },
        });
      }

      // 2. New deals
      const newDealChanges = stageChanges.filter(sc => sc.activity_type === 'deal_created').slice(0, 3);
      for (const sc of newDealChanges) {
        const dealName = deals.find(d => d.id === sc.deal_id)?.company || 'New Deal';
        newsItems.push({
          id: `nd-${sc.id}`,
          category: 'pipeline',
          title: `New deal added: ${dealName}`,
          summary: sc.description || 'A new deal was created in the pipeline.',
          timestamp: sc.created_at,
          action: sc.deal_id ? { label: 'Open Deal', path: `/deal/${sc.deal_id}` } : undefined,
        });
      }

      // 3. High-priority & follow-up emails
      const importantEmails = emailCache
        .filter(e => {
          const analysis = analysisMap.get(e.id);
          return analysis && (analysis.priority === 'high' || analysis.follow_up_needed);
        })
        .slice(0, 5);
      for (const e of importantEmails) {
        const analysis = analysisMap.get(e.id);
        newsItems.push({
          id: `em-${e.id}`,
          category: 'email',
          title: e.subject || '(no subject)',
          summary: analysis?.summary || e.snippet || '',
          timestamp: e.received_at || '',
          action: { label: 'Open Email Intelligence', path: '/email-intelligence' },
          meta: { from_name: e.from_name, from_email: e.from_email, priority: analysis?.priority, category: analysis?.category },
        });
      }

      // 4. Risk deals
      const riskDeals = activeDeals.filter(d => d.isFlagged).slice(0, 3);
      for (const d of riskDeals) {
        newsItems.push({
          id: `risk-${d.id}`,
          category: 'risk',
          title: `${d.company} flagged for attention`,
          summary: `Currently at stage "${d.stage}" — may need follow-up.`,
          timestamp: new Date().toISOString(),
          action: { label: 'Open Deal', path: `/deal/${d.id}` },
        });
      }

      // 5. Overdue milestones
      const overdueMilestones = milestones
        .filter(m => m.due_date && new Date(m.due_date) < new Date())
        .slice(0, 3);
      for (const m of overdueMilestones) {
        const dealName = deals.find(d => d.id === m.deal_id)?.company || 'Unknown Deal';
        newsItems.push({
          id: `ms-${m.id}`,
          category: 'milestone',
          title: `Overdue: ${m.title} — ${dealName}`,
          summary: `Due ${m.due_date ? new Date(m.due_date).toLocaleDateString() : 'N/A'}, still incomplete.`,
          timestamp: m.due_date || '',
          action: m.deal_id ? { label: 'Open Deal', path: `/deal/${m.deal_id}` } : undefined,
        });
      }

      // Sort news by timestamp desc
      newsItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return { alerts, highlights, newsItems, window };
    },
  });
}

// ── Email tab data ────────────────────────────────────────────
// When `targetUserId` is provided AND it's not the current user, the email
// data is fetched via the `briefing-for-user` edge function (service role,
// allow-list-gated). Otherwise we read directly with RLS as the current user.
export function useEmailData(enabled: boolean, targetUserId?: string) {
  const { user } = useAuth();
  const window = useBriefingWindow();
  const effectiveUserId = targetUserId || user?.id;
  const isDelegated = !!targetUserId && targetUserId !== user?.id;

  return useQuery({
    queryKey: ['briefing-email', window.startISO, effectiveUserId, isDelegated ? 'delegated' : 'self'],
    enabled: enabled && !!effectiveUserId,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;

      if (isDelegated) {
        const { data, error } = await supabase.functions.invoke('briefing-for-user', {
          body: { targetUserId, startISO, endISO, dataset: 'email' },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);
        const emailCache = (data?.emailCache || []) as any[];
        const emailAnalysis = (data?.emailAnalysis || []) as any[];
        const analysisMap = new Map(emailAnalysis.map((a: any) => [a.email_cache_id, a]));
        const emails = emailCache.map((e: any) => ({ ...e, analysis: analysisMap.get(e.id) || null }));
        return { emails };
      }

      const [emailCacheRes, emailAnalysisRes] = await Promise.all([
        supabase
          .from('email_cache')
          .select('id, gmail_message_id, thread_id, subject, snippet, from_email, from_name, received_at, is_read, labels')
          .eq('user_id', effectiveUserId!)
          .gte('received_at', startISO)
          .lte('received_at', endISO)
          .order('received_at', { ascending: false })
          .limit(50),
        supabase
          .from('email_analysis')
          .select('email_cache_id, category, sentiment, priority, summary, deal_name, follow_up_needed')
          .gte('analyzed_at', startISO)
          .limit(200),
      ]);

      const emailCache = emailCacheRes.data || [];
      const emailAnalysis = emailAnalysisRes.data || [];
      const analysisMap = new Map(emailAnalysis.map(a => [a.email_cache_id, a]));
      const emails = emailCache.map(e => ({ ...e, analysis: analysisMap.get(e.id) || null }));
      return { emails };
    },
  });
}

// ── Financial tab data ────────────────────────────────────────
export function useFinancialData(enabled: boolean) {
  const window = useBriefingWindow();

  return useQuery({
    queryKey: ['briefing-financial', window.startISO],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;
      const [invoiceRes, expenseRes] = await Promise.all([
        supabase
          .from('quickbooks_invoices')
          .select('id, txn_date, customer_name, total_amt, doc_number')
          .gte('txn_date', startISO.slice(0, 10))
          .lte('txn_date', endISO.slice(0, 10))
          .order('txn_date', { ascending: false })
          .limit(50),
        supabase
          .from('quickbooks_expenses')
          .select('id, txn_date, total_amt, vendor_name')
          .gte('txn_date', startISO.slice(0, 10))
          .lte('txn_date', endISO.slice(0, 10))
          .order('txn_date', { ascending: false })
          .limit(50),
      ]);
      return {
        recentInvoices: invoiceRes.data || [],
        recentExpenses: expenseRes.data || [],
      };
    },
  });
}

// ── Pipeline tab data ─────────────────────────────────────────
// When `targetDealOwnerName` is provided, the deal set is narrowed to deals
// where that user is Deal Owner OR Deal Manager (see getDealsForUserName).
// All downstream sections (newDeals, riskDeals, stageChanges, recentActivity)
// share that narrowed deal set, so no Niki-unowned activity leaks in.
export function usePipelineData(enabled: boolean, targetDealOwnerName?: string) {
  const { user } = useAuth();
  const { deals: allDeals } = useDealsContext();
  const window = useBriefingWindow();

  const deals = useMemo(
    () => (targetDealOwnerName ? getDealsForUserName(allDeals, targetDealOwnerName) : allDeals),
    [allDeals, targetDealOwnerName],
  );
  const dealIdSet = useMemo(() => new Set(deals.map(d => d.id)), [deals]);
  const isDelegated = !!targetDealOwnerName;

  return useQuery({
    queryKey: ['briefing-pipeline', window.startISO, user?.id, isDelegated ? `for:${targetDealOwnerName}` : 'self'],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;
      const [activityRes, stageChangeRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, user_display_name, created_at, metadata')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, created_at, metadata')
          .in('activity_type', ['stage_change', 'lender_stage_change', 'deal_created'])
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const rawActivities = activityRes.data || [];
      const rawStageChanges = stageChangeRes.data || [];
      const activities = isDelegated
        ? rawActivities.filter(a => a.deal_id && dealIdSet.has(a.deal_id))
        : rawActivities;
      const stageChanges = isDelegated
        ? rawStageChanges.filter(sc => sc.deal_id && dealIdSet.has(sc.deal_id))
        : rawStageChanges;

      const dealCreatedIds = new Set(stageChanges.filter(sc => sc.activity_type === 'deal_created').map(sc => sc.deal_id));
      const newDeals = deals.filter(d => dealCreatedIds.has(d.id));

      const suppressedStatuses = ['archived', 'on-hold', 'on_hold'];
      const activeDeals = deals.filter(d => !suppressedStatuses.includes((d.status || '').toLowerCase()));
      const riskDeals = activeDeals.filter(d => {
        if (d.isFlagged) return true;
        const lastActivity = activities.find(a => a.deal_id === d.id);
        if (!lastActivity) {
          const created = new Date(d.createdAt || '');
          return (Date.now() - created.getTime()) / 86_400_000 > 14;
        }
        return false;
      }).slice(0, 20);

      return {
        newDeals,
        riskDeals,
        stageChanges: stageChanges.slice(0, 20),
        recentActivity: activities.slice(0, 30),
        isDelegated,
        targetUserName: targetDealOwnerName,
        // Full scoped deal list (Owner/Manager filtered when delegated, else
        // all org deals minus suppressed). Consumed by the Memo view.
        scopedDeals: activeDeals,
      };
    },
  });
}

// ── Operational tab data (Asana portfolio) ───────────────────
// Optional `targetAssigneeName` filters Asana tasks to only those assigned to
// that name (e.g., "Niki Heikali"). The edge function gates this server-side
// to allow-listed callers.
export function useOperationalData(enabled: boolean, targetAssigneeName?: string) {
  return useQuery({
    queryKey: ['briefing-operational-asana', targetAssigneeName || 'self'],
    enabled,
    staleTime: 5 * 60_000, // 5 min client-side cache
    retry: 1, // Don't spam retries on rate limit errors
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('briefing-operational', {
        body: targetAssigneeName ? { targetAssigneeName } : {},
      });
      if (error) throw new Error(error.message);
      return data as {
        error?: string;
        fallback?: boolean;
        partial?: boolean;
        partialErrors?: number;
        counts: {
          projects: number;
          overdue: number;
          today: number;
          upcoming: number;
        };
        summary: {
          total_projects: number;
          overdue_count: number;
          due_today_count: number;
          upcoming_milestones_count: number;
          total_open_tasks: number;
        };
        projects: Array<{
          gid: string;
          name: string;
          permalink_url: string | null;
          owner: string | null;
          owner_email: string | null;
          due_on: string | null;
          start_on: string | null;
          color: string | null;
          status_type: string | null;
          status_title: string | null;
          status_text: string | null;
          task_count: number;
          last_activity_at: string | null;
        }>;
        overdue: Array<any>;
        today: Array<any>;
        upcoming: Array<any>;
        recentlyCompleted: Array<any>;
      };
    },
  });
}

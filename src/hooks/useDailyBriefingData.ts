import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { getDailyBriefingWindow } from '@/utils/dailyBriefingWindow';

// ── Shared window (memoized) ──────────────────────────────────
export function useBriefingWindow() {
  return useMemo(() => getDailyBriefingWindow('interactive'), []);
}

// ── Catch Up tab data ─────────────────────────────────────────
export function useCatchUpData(enabled: boolean) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const window = useBriefingWindow();

  return useQuery({
    queryKey: ['briefing-catchup', window.startISO, user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;

      const [activityRes, stageChangeRes, milestonesRes] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, user_display_name, created_at, metadata')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, created_at')
          .in('activity_type', ['stage_change', 'lender_stage_change', 'deal_created'])
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .limit(50),
        supabase
          .from('deal_milestones')
          .select('id, deal_id, title, status, due_date, completed')
          .eq('completed', false)
          .limit(50),
      ]);

      const activities = activityRes.data || [];
      const stageChanges = stageChangeRes.data || [];
      const milestones = milestonesRes.data || [];

      const alerts = activities
        .filter(a => {
          const meta = a.metadata as any;
          return meta?.priority === 'high' || a.activity_type === 'flex_info_request';
        })
        .slice(0, 10);

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

      return { alerts, highlights, window };
    },
  });
}

// ── Email tab data ────────────────────────────────────────────
export function useEmailData(enabled: boolean) {
  const { user } = useAuth();
  const window = useBriefingWindow();

  return useQuery({
    queryKey: ['briefing-email', window.startISO, user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { startISO, endISO } = window;
      const [emailCacheRes, emailAnalysisRes] = await Promise.all([
        supabase
          .from('email_cache')
          .select('id, gmail_message_id, subject, snippet, from_email, from_name, received_at, is_read, labels')
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
export function usePipelineData(enabled: boolean) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const window = useBriefingWindow();

  return useQuery({
    queryKey: ['briefing-pipeline', window.startISO, user?.id],
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

      const activities = activityRes.data || [];
      const stageChanges = stageChangeRes.data || [];

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
      };
    },
  });
}

// ── Operational tab data ──────────────────────────────────────
export function useOperationalData(enabled: boolean) {
  return useQuery({
    queryKey: ['briefing-operational'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await supabase
        .from('deal_milestones')
        .select('id, deal_id, title, status, due_date, completed')
        .eq('completed', false)
        .order('due_date', { ascending: true })
        .limit(100);
      return { milestones: res.data || [] };
    },
  });
}

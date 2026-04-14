import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { getDailyBriefingWindow } from '@/utils/dailyBriefingWindow';

export interface BriefingData {
  window: { startISO: string; endISO: string; label: string };
  catchUp: {
    recentActivity: any[];
    alerts: any[];
  };
  email: {
    emails: any[];
  };
  financial: {
    recentInvoices: any[];
    recentExpenses: any[];
  };
  pipeline: {
    newDeals: any[];
    riskDeals: any[];
    stageChanges: any[];
  };
  operational: {
    milestones: any[];
  };
}

export function useDailyBriefingData(enabled: boolean) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const window = getDailyBriefingWindow('interactive');

  const query = useQuery({
    queryKey: ['daily-briefing', window.startISO, user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<BriefingData> => {
      const { startISO, endISO } = window;

      // ── Parallel fetches ──
      const [
        activityRes,
        emailCacheRes,
        emailAnalysisRes,
        invoiceRes,
        expenseRes,
        stageChangeRes,
        milestonesRes,
      ] = await Promise.all([
        // Recent activity logs
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, user_display_name, created_at, metadata')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(100),
        // Cached emails
        supabase
          .from('email_cache')
          .select('id, gmail_message_id, subject, snippet, from_email, from_name, received_at, is_read, labels')
          .eq('user_id', user!.id)
          .gte('received_at', startISO)
          .lte('received_at', endISO)
          .order('received_at', { ascending: false })
          .limit(50),
        // Email analysis (we'll join in-memory)
        supabase
          .from('email_analysis')
          .select('email_cache_id, category, sentiment, priority, summary, deal_name, follow_up_needed')
          .gte('analyzed_at', startISO)
          .limit(200),
        // QuickBooks invoices in window
        supabase
          .from('quickbooks_invoices')
          .select('id, txn_date, customer_name, total_amt, doc_number')
          .gte('txn_date', startISO.slice(0, 10))
          .lte('txn_date', endISO.slice(0, 10))
          .order('txn_date', { ascending: false })
          .limit(50),
        // QuickBooks expenses in window
        supabase
          .from('quickbooks_expenses')
          .select('id, txn_date, total_amt, vendor_name')
          .gte('txn_date', startISO.slice(0, 10))
          .lte('txn_date', endISO.slice(0, 10))
          .order('txn_date', { ascending: false })
          .limit(50),
        // Stage changes (activity_logs of type stage_change / lender_stage_change)
        supabase
          .from('activity_logs')
          .select('id, deal_id, activity_type, description, created_at, metadata')
          .in('activity_type', ['stage_change', 'lender_stage_change', 'deal_created'])
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(50),
        // Milestones (upcoming/overdue)
        supabase
          .from('deal_milestones')
          .select('id, deal_id, title, status, due_date, assignee, completed')
          .eq('completed', false)
          .order('due_date', { ascending: true })
          .limit(100),
      ]);

      const activities = activityRes.data || [];
      const emailCache = emailCacheRes.data || [];
      const emailAnalysis = emailAnalysisRes.data || [];
      const invoices = invoiceRes.data || [];
      const expenses = expenseRes.data || [];
      const stageChanges = stageChangeRes.data || [];
      const milestones = milestonesRes.data || [];

      // Enrich emails with analysis
      const analysisMap = new Map(emailAnalysis.map(a => [a.email_cache_id, a]));
      const enrichedEmails = emailCache.map(e => ({
        ...e,
        analysis: analysisMap.get(e.id) || null,
      }));

      // Identify deals added in window
      const dealCreatedIds = new Set(
        stageChanges
          .filter(sc => sc.activity_type === 'deal_created')
          .map(sc => sc.deal_id)
      );
      const newDeals = deals.filter(d => dealCreatedIds.has(d.id));

      // Identify risk deals: stale, at-risk, etc (active deals with old updates)
      const suppressedStatuses = ['archived', 'on-hold', 'on_hold'];
      const activeDeals = deals.filter(
        d => !suppressedStatuses.includes((d.status || '').toLowerCase())
      );
      const riskDeals = activeDeals.filter(d => {
        if (d.flagStatus === 'red' || d.flagStatus === 'yellow') return true;
        // Stale: no activity in 14 days
        const lastActivity = activities.find(a => a.deal_id === d.id);
        if (!lastActivity) {
          const created = new Date(d.createdAt || '');
          const daysSince = (Date.now() - created.getTime()) / 86_400_000;
          return daysSince > 14;
        }
        return false;
      }).slice(0, 20);

      // Alerts: high-priority items from activities
      const alerts = activities
        .filter(a => {
          const meta = a.metadata as any;
          return meta?.priority === 'high' || a.activity_type === 'flex_info_request';
        })
        .slice(0, 10);

      return {
        window,
        catchUp: {
          recentActivity: activities.slice(0, 20),
          alerts,
        },
        email: {
          emails: enrichedEmails,
        },
        financial: {
          recentInvoices: invoices,
          recentExpenses: expenses,
        },
        pipeline: {
          newDeals,
          riskDeals,
          stageChanges: stageChanges.slice(0, 20),
        },
        operational: {
          milestones,
        },
      };
    },
  });

  return query;
}

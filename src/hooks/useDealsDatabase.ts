import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Deal, DealLender, DealStatus, DealStage, DealClass, EngagementType, ExclusivityType, Referrer, LenderNoteHistory, LenderTrackingStatus } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
import type { TriggerType, WorkflowAction } from '@/components/workflows/WorkflowBuilder';
import { addDays } from 'date-fns';
import { getNaitivePipelineId, excludeNaitivePipelineDeals } from '@/utils/naitivePipelineExclusion';
import { autoPopulateOutstandingItems, isActivePipeline, isFinalCreditItemsStage, isNdaNeedsListSentStage } from '@/utils/autoPopulateOutstandingItems';
import { checkStageChangeWorkflows } from '@/lib/emailWorkflowTrigger';
import { isFlexHiddenStage, prettyStageLabel } from '@/lib/flexVisibility';
import { syncFinServValuePatch, warnIfFinServValueMismatch } from '@/lib/finservValue';
import { seedDemoDealFundingSources } from '@/utils/seedDemoDealFundingSources';

type MilestoneTimingType = 'from_creation' | 'after_previous';
type WebhookEventType = 'INSERT' | 'UPDATE' | 'DELETE';

// Helper function to trigger webhooks
async function triggerWebhookSync(
  userId: string,
  table: string,
  type: WebhookEventType,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null = null
) {
  try {
    // Fire and forget - don't await to not block the main operation
    supabase.functions.invoke('webhook-sync', {
      body: {
        type,
        table,
        record,
        old_record: oldRecord,
        user_id: userId,
        timestamp: new Date().toISOString(),
      },
    }).then(({ error }) => {
      if (error) {
        console.error('Webhook trigger failed:', error);
      }
    });
  } catch (error) {
    // Silent fail - webhooks should not block main operations
    console.error('Webhook trigger error:', error);
  }
}

interface DefaultMilestone {
  id: string;
  title: string;
  days_from_creation: number | null;
  timing_type?: MilestoneTimingType;
  position: number;
}

// Fetch default milestones from the company-scoped DB table
async function getDefaultMilestonesForCompany(companyId: string): Promise<DefaultMilestone[]> {
  try {
    const { data, error } = await supabase
      .from('default_milestones' as any)
      .select('id, title, days_from_creation, timing_type, position')
      .eq('company_id', companyId)
      .order('position', { ascending: true });

    if (error) {
      console.error('Failed to load default milestones:', error);
      return [];
    }
    return (data || []) as unknown as DefaultMilestone[];
  } catch (error) {
    console.error('Failed to load default milestones:', error);
    return [];
  }
}

// Create default milestones for a new deal
async function createDefaultMilestones(dealId: string, userId: string, companyId?: string) {
  if (!companyId) return;
  const defaultMilestones = await getDefaultMilestonesForCompany(companyId);
  if (defaultMilestones.length === 0) return;

  const now = new Date();
  const sortedMilestones = [...defaultMilestones].sort((a, b) => a.position - b.position);
  
  // Calculate due dates based on timing type
  const milestonesToInsert = sortedMilestones.map((m, index) => {
    const timingType = m.timing_type || 'from_creation';
    
    // For "after previous" milestones (except the first one), set due date as null
    // The due date will be set when the previous milestone is completed
    if (timingType === 'after_previous' && index > 0) {
      return {
        deal_id: dealId,
        user_id: userId,
        title: m.title,
        due_date: null as string | null,
        completed: false,
        position: index,
      };
    }
    
    // For "from creation" or first milestone, calculate from deal creation
    const dueDate = m.days_from_creation !== null ? addDays(now, m.days_from_creation) : null;
    return {
      deal_id: dealId,
      user_id: userId,
      title: m.title,
      due_date: dueDate ? dueDate.toISOString() : null as string | null,
      completed: false,
      position: index,
    };
  });

  try {
    await supabase.from('deal_milestones').insert(milestonesToInsert);
  } catch (error) {
    console.error('Error creating default milestones:', error);
  }
}

interface DbDeal {
  id: string;
  company: string;
  value: number;
  status: string;
  stage: string;
  engagement_type: string | null;
  exclusivity: string | null;
  deal_type: string | null;
  referred_by: string | null;
  pipeline_id: string | null;
  manager: string | null;
  deal_owner: string | null;
  analyst: string | null;
  is_flagged: boolean;
  flag_notes: string | null;
  notes: string | null;
  notes_updated_at: string | null;
  narrative?: string | null;
  contact: string | null;
  contact_info: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  pre_signing_hours: number | null;
  post_signing_hours: number | null;
  total_fee: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
  migrated_from_personal: boolean;
}

interface DbDealLender {
  id: string;
  deal_id: string;
  name: string;
  stage: string;
  substage: string | null;
  notes: string | null;
  pass_reason: string | null;
  tracking_status: string | null;
  quote_amount: number | null;
  quote_rate: number | null;
  quote_term: string | null;
  created_at: string;
  updated_at: string;
}

type LenderTimestampFields = {
  submitted_at: string | null;
  approved_at: string | null;
  passed_at: string | null;
  declined_at: string | null;
  excluded_at: string | null;
  on_hold_at: string | null;
  on_deck_at: string | null;
  last_status_change_at: string | null;
};

// Helper function to trigger workflows
async function triggerWorkflow(
  triggerType: TriggerType,
  triggerData: Record<string, any>
) {
  try {
    // Fetch active workflows matching this trigger type
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('trigger_type', triggerType)
      .eq('is_active', true);

    if (error || !workflows || workflows.length === 0) return;

    // Filter and execute matching workflows
    for (const workflow of workflows) {
      const config = workflow.trigger_config as Record<string, any>;
      
      // Check stage-based triggers
      if (triggerType === 'deal_stage_change' || triggerType === 'lender_stage_change') {
        if (config.fromStage && config.fromStage !== triggerData.fromStage) continue;
        if (config.toStage && config.toStage !== triggerData.toStage) continue;
      }

      // Execute the workflow
      supabase.functions.invoke('execute-workflow', {
        body: {
          workflowId: workflow.id,
          triggerType,
          triggerData,
          actions: workflow.actions as unknown as WorkflowAction[],
        },
      }).then(({ error: execError }) => {
        if (execError) {
          console.error(`Error executing workflow ${workflow.name}:`, execError);
        } else {
          console.log(`Workflow ${workflow.name} triggered`);
        }
      });
    }
  } catch (err) {
    console.error('Error triggering workflows:', err);
  }
}

export function useDealsDatabase() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Keep a ref to track previous deal states for detecting stage changes
  const previousDealsRef = useRef<Map<string, Deal>>(new Map());
  
  // Track when optimistic updates are in progress to skip realtime refetches
  const pendingOptimisticUpdatesRef = useRef<Set<string>>(new Set());
  const realtimeRefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track whether we've successfully loaded deals at least once
  const hasLoadedOnceRef = useRef(false);
  // Track consecutive empty fetches to distinguish real empty from transient failures
  const consecutiveEmptyFetchesRef = useRef(0);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Don't clear userId during token refresh - only on explicit sign out or initial
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        hasLoadedOnceRef.current = false;
        consecutiveEmptyFetchesRef.current = 0;
      } else if (session?.user?.id) {
        setUserId(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper to map database deal to Deal type
  const mapDbDealToDeal = useCallback((
    dbDeal: DbDeal,
    dbLenders: DbDealLender[] = [],
    notesHistoryMap: Record<string, LenderNoteHistory[]> = {}
  ): Deal => {
    const dealLenders = dbLenders
      .filter((l: DbDealLender) => l.deal_id === dbDeal.id)
      .map((l: DbDealLender) => ({
        id: l.id,
        name: l.name,
        status: 'in-review' as const,
        stage: l.stage,
        substage: l.substage || undefined,
        trackingStatus: (l.tracking_status || 'active') as LenderTrackingStatus,
        notes: l.notes || undefined,
        passReason: l.pass_reason || undefined,
        score: (l as any).score ?? null,
        updatedAt: l.updated_at,
        createdAt: l.created_at,
        submittedAt: (l as any).submitted_at ?? null,
        approvedAt: (l as any).approved_at ?? null,
        passedAt: (l as any).passed_at ?? null,
        declinedAt: (l as any).declined_at ?? null,
        excludedAt: (l as any).excluded_at ?? null,
        onHoldAt: (l as any).on_hold_at ?? null,
        onDeckAt: (l as any).on_deck_at ?? null,
        lastStatusChangeAt: (l as any).last_status_change_at ?? null,
        notesHistory: notesHistoryMap[l.id] || [],
      }));

    // Defensive dedupe: never render the same funding source twice on a deal.
    // A unique DB index now enforces this on (deal_id, master_lender_id) and
    // (deal_id, lower(name)), but stale realtime payloads or optimistic
    // inserts could still surface a duplicate before reconciliation — collapse
    // by id first, then by master_lender_id || lower(name).
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const dedupedDealLenders = dealLenders.filter((l) => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      const naturalKey =
        (dbLenders.find((r) => r.id === l.id) as any)?.master_lender_id ||
        (l.name ? `name:${l.name.trim().toLowerCase()}` : null);
      if (naturalKey) {
        if (seenKeys.has(naturalKey)) return false;
        seenKeys.add(naturalKey);
      }
      return true;
    });

    const toReferrer = (name: string | null): Referrer | undefined => {
      if (!name) return undefined;
      return {
        id: `ref-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
      };
    };

    // Parse deal_type from JSON string or single value to array
    const parseDealTypes = (dealType: string | null): string[] | undefined => {
      if (!dealType) return undefined;
      try {
        const parsed = JSON.parse(dealType);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
      } catch {
        return [dealType];
      }
    };

    return {
      id: dbDeal.id,
      name: dbDeal.company,
      company: dbDeal.company,
      stage: dbDeal.stage as DealStage,
      status: (dbDeal.status || null) as DealStatus | null,
      engagementType: (dbDeal.engagement_type || 'advisory') as EngagementType,
      exclusivity: (dbDeal.exclusivity || undefined) as ExclusivityType | undefined,
      dealTypes: parseDealTypes(dbDeal.deal_type),
      manager: dbDeal.manager || '',
      dealOwner: dbDeal.deal_owner || undefined,
      analyst: (dbDeal as any).analyst || undefined,
      isFlagged: dbDeal.is_flagged || false,
      flagNotes: dbDeal.flag_notes || undefined,
      referredBy: toReferrer(dbDeal.referred_by),
      referralSourceContactId: (dbDeal as any).referral_source_contact_id || null,
      lender: dedupedDealLenders[0]?.name || '',
      value: Number(dbDeal.value),
      totalFee: Number(dbDeal.total_fee || 0),
      retainerFee: Number(dbDeal.retainer_fee || 0),
      milestoneFee: Number(dbDeal.milestone_fee || 0),
      successFeePercent: Number(dbDeal.success_fee_percent || 0),
      preSigningHours: Number(dbDeal.pre_signing_hours || 0),
      postSigningHours: Number(dbDeal.post_signing_hours || 0),
      notes: dbDeal.notes || undefined,
      notesUpdatedAt: dbDeal.notes_updated_at || undefined,
      narrative: dbDeal.narrative || undefined,
      contact: dbDeal.contact || '',
      contactInfo: dbDeal.contact_info || undefined,
      companyUrl: (dbDeal as any).company_url || undefined,
      businessModel: (dbDeal as any).business_model || undefined,
      sourcedVia: (dbDeal as any).sourced_via || undefined,
      createdAt: dbDeal.created_at,
      updatedAt: dbDeal.updated_at,
      lenders: dedupedDealLenders,
      migratedFromPersonal: dbDeal.migrated_from_personal || false,
      pipelineId: dbDeal.pipeline_id || undefined,
      closingDate: (dbDeal as any).closing_date || null,
      dashboardClosingDate: (dbDeal as any).dashboard_closing_date || null,
      dealClass: ((dbDeal as any).deal_class || 'standard') as DealClass,
      onHold: (dbDeal as any).on_hold === true,
      // Pipeline-specific (FinServ) fields
      contactEmail: (dbDeal as any).contact_email || undefined,
      leadSource: (dbDeal as any).lead_source || undefined,
      referralSource: (dbDeal as any).referral_source || undefined,
      opportunityType: (dbDeal as any).opportunity_type || undefined,
      servicesOffered: Array.isArray((dbDeal as any).services_offered) ? (dbDeal as any).services_offered : undefined,
      feeType: (dbDeal as any).fee_type || undefined,
      mrr: (dbDeal as any).mrr ?? null,
      mrrMode: ((dbDeal as any).mrr_mode === 'calculated' ? 'calculated' : 'manual') as 'manual' | 'calculated',
      oneTimeRevenue: (dbDeal as any).one_time_revenue ?? null,
      projectedCloseDate: (dbDeal as any).projected_close_date || null,
      contractStartDate: (dbDeal as any).contract_start_date || null,
      contractEndDate: (dbDeal as any).contract_end_date || null,
    };
  }, []);

  // Fetch all deals from database - OPTIMIZED with parallel queries
  const fetchDeals = useCallback(async () => {
    if (!userId) {
      // Only clear deals on explicit sign-out (hasLoadedOnce resets on sign-out)
      if (!hasLoadedOnceRef.current) {
        setDeals([]);
        setIsLoading(false);
      }
      return;
    }

    try {
      // Only show loading spinner on the very first load
      if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }
      
      // Verify we have a valid session before fetching
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('[fetchDeals] No valid session, skipping fetch to preserve existing data');
        return;
      }
      
      // Fetch deals and lenders in parallel for faster loading
      // NOTE: Supabase default limit is 1000 rows. We need all deals, so we
      // paginate or use a large limit to avoid silently dropping records.
      const fetchAllDeals = async () => {
        const allData: any[] = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('deals')
            .select('*')
            .order('updated_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (data) allData.push(...data);
          hasMore = data?.length === pageSize;
          from += pageSize;
        }
        return { data: allData, error: null };
      };

      const fetchAllDealLenders = async () => {
        const allData: any[] = [];
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('deal_lenders')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (data) allData.push(...data);
          hasMore = data?.length === pageSize;
          from += pageSize;
        }
        return { data: allData, error: null };
      };

      const [dealsResult, lendersResult] = await Promise.all([
        fetchAllDeals(),
        fetchAllDealLenders(),
      ]);

      if (dealsResult.error) throw dealsResult.error;
      if (lendersResult.error) throw lendersResult.error;

      // Exclude naitive Pipeline and FinServ deals from standard deal metrics using deal_class
      const naitivePipelineId = await getNaitivePipelineId();
      const dbDeals = (dealsResult.data || []).filter((d: any) => {
        const dc = d.deal_class || 'standard';
        return dc !== 'naitive' && dc !== 'finserv';
      });
      const dbLenders = lendersResult.data || [];

      // Build pipelineId -> pipelineName map so Deal.pipelineName can be
      // populated during mapping. Enables downstream helpers (isActiveDeal,
      // isProjectsDeal) to silo the Projects pipeline without extra lookups.
      const pipelineNameById: Record<string, string> = {};
      {
        const pipelineIds = Array.from(new Set(
          (dbDeals || []).map((d: any) => d.pipeline_id).filter(Boolean)
        )) as string[];
        if (pipelineIds.length > 0) {
          const { data: pipeRows } = await supabase
            .from('deal_pipelines')
            .select('id, name')
            .in('id', pipelineIds);
          (pipeRows || []).forEach((p: { id: string; name: string }) => {
            pipelineNameById[p.id] = p.name;
          });
        }
      }
      const attachPipelineName = (d: Deal): Deal => (
        d.pipelineId && pipelineNameById[d.pipelineId]
          ? { ...d, pipelineName: pipelineNameById[d.pipelineId] }
          : d
      );

      if (!dbDeals || dbDeals.length === 0) {
        // If we previously had deals and now get empty, it's likely a transient auth issue
        // Require multiple consecutive empty fetches before actually clearing
        if (hasLoadedOnceRef.current && deals.length > 0) {
          consecutiveEmptyFetchesRef.current += 1;
          console.warn(`[fetchDeals] Got 0 deals but previously had ${deals.length}. Consecutive empty: ${consecutiveEmptyFetchesRef.current}`);
          
          if (consecutiveEmptyFetchesRef.current < 3) {
            // Retry after a short delay instead of clearing
            setTimeout(() => fetchDeals(), 2000);
            return;
          }
          // After 3 consecutive empty fetches, accept it as real
          console.warn('[fetchDeals] Accepting empty result after 3 consecutive empty fetches');
        }
        
        setDeals([]);
        setIsLoading(false);
        hasLoadedOnceRef.current = true;
        consecutiveEmptyFetchesRef.current = 0;
        return;
      }

      // Reset empty counter on successful non-empty fetch
      consecutiveEmptyFetchesRef.current = 0;
      hasLoadedOnceRef.current = true;

      // Fetch notes history in parallel (non-blocking for initial render)
      const lenderIds = dbLenders.map((l: DbDealLender) => l.id);
      let notesHistoryMap: Record<string, LenderNoteHistory[]> = {};
      
      if (lenderIds.length > 0) {
        // Start notes history fetch but don't block initial render
        const notesPromise = supabase
          .from('lender_notes_history')
          .select('*')
          .in('deal_lender_id', lenderIds)
          .order('created_at', { ascending: false });
        
        // Map deals immediately for faster initial render
      const initialMappedDeals: Deal[] = dbDeals.map((dbDeal: DbDeal) =>
          attachPipelineName(mapDbDealToDeal(dbDeal, dbLenders, {}))
        );
        initialMappedDeals.forEach((deal) => warnIfFinServValueMismatch(deal, 'useDealsDatabase.fetchDeals.initial'));
        setDeals(initialMappedDeals);
        setIsLoading(false);
        
        // Then update with notes history when available
        const { data: notesHistory } = await notesPromise;
        if (notesHistory && notesHistory.length > 0) {
          notesHistory.forEach((nh: any) => {
            if (!notesHistoryMap[nh.deal_lender_id]) {
              notesHistoryMap[nh.deal_lender_id] = [];
            }
            notesHistoryMap[nh.deal_lender_id].push({
              id: nh.id,
              text: nh.text,
              updatedAt: nh.created_at,
            });
          });
          
          // Update with complete data including notes history
          const fullMappedDeals: Deal[] = dbDeals.map((dbDeal: DbDeal) =>
            attachPipelineName(mapDbDealToDeal(dbDeal, dbLenders, notesHistoryMap))
          );
          fullMappedDeals.forEach((deal) => warnIfFinServValueMismatch(deal, 'useDealsDatabase.fetchDeals.full'));
          setDeals(fullMappedDeals);
        }
        return;
      }

      // No lenders - just map deals
      const mappedDeals: Deal[] = dbDeals.map((dbDeal: DbDeal) =>
        attachPipelineName(mapDbDealToDeal(dbDeal, dbLenders, notesHistoryMap))
      );
      mappedDeals.forEach((deal) => warnIfFinServValueMismatch(deal, 'useDealsDatabase.fetchDeals'));
      setDeals(mappedDeals);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError(err as Error);
      // Don't wipe existing deals on error - preserve stale data
      if (!hasLoadedOnceRef.current) {
        setDeals([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, mapDbDealToDeal, deals.length]);

  // Create a new deal
  const createDeal = useCallback(async (dealData: Partial<Deal>): Promise<Deal | null> => {
    if (!userId) {
      toast({
        title: "Error",
        description: "You must be logged in to create a deal",
        variant: "destructive",
      });
      return null;
    }

    try {
      // Get user's company_id if they belong to a company
      const { data: memberData } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId)
        .maybeSingle();

      const { data, error } = await supabase
        .from('deals')
        .insert({
          company: (dealData.company || 'New Deal').trim() || 'New Deal',
          value: dealData.value || 0,
          status: dealData.status ?? null,
          stage: dealData.stage || 'final-credit-items',
          engagement_type: dealData.engagementType || 'advisory',
          manager: dealData.manager || null,
          deal_owner: dealData.dealOwner || null,
          referred_by: dealData.referredBy?.name || null,
          notes: dealData.notes || null,
          notes_updated_at: dealData.notes ? new Date().toISOString() : null,
          narrative: dealData.narrative || null,
          contact: dealData.contact || null,
          contact_info: dealData.contactInfo || null,
          deal_type: dealData.dealTypes && dealData.dealTypes.length > 0 ? JSON.stringify(dealData.dealTypes) : null,
          user_id: userId,
          company_id: memberData?.company_id || null,
           pipeline_id: dealData.pipelineId || null,
           deal_class: dealData.dealClass || 'standard',
         })
        .select()
        .single();

      if (error) throw error;

      try {
        const { logActivity } = await import("@/lib/activityLogger");
        logActivity({
          event_type: "feature_used",
          event_data: { feature: "deal_created", deal_id: data.id, company: data.company },
          company_id: memberData?.company_id ?? null,
        });
      } catch { /* best-effort */ }

      const toReferrer = (name: string | null): Referrer | undefined => {
        if (!name) return undefined;
        return {
          id: `ref-${name.toLowerCase().replace(/\s+/g, '-')}`,
          name,
        };
      };

      const newDeal: Deal = {
        id: data.id,
        name: data.company,
        company: data.company,
        stage: data.stage as DealStage,
        status: (data.status || null) as DealStatus | null,
        engagementType: (data.engagement_type || 'advisory') as EngagementType,
        manager: data.manager || '',
        dealOwner: data.deal_owner || undefined,
        analyst: (data as any).analyst || undefined,
        referredBy: toReferrer(data.referred_by),
        lender: '',
        value: Number(data.value),
        totalFee: Number(data.total_fee || 0),
        retainerFee: Number(data.retainer_fee || 0),
        milestoneFee: Number(data.milestone_fee || 0),
        successFeePercent: Number(data.success_fee_percent || 0),
        preSigningHours: Number(data.pre_signing_hours || 0),
        postSigningHours: Number(data.post_signing_hours || 0),
        notes: data.notes || undefined,
        notesUpdatedAt: data.notes_updated_at || undefined,
        contact: data.contact || '',
        contactInfo: data.contact_info || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        lenders: [],
        dealTypes: dealData.dealTypes || undefined,
        pipelineId: (data as any).pipeline_id || undefined,
        dealClass: ((data as any).deal_class || 'standard') as DealClass,
      };

      setDeals(prev => [newDeal, ...prev]);
      
      // Create default milestones for the new deal
      await createDefaultMilestones(newDeal.id, userId, memberData?.company_id || undefined);
      
      // Trigger new_deal workflow
      triggerWorkflow('new_deal', {
        dealId: newDeal.id,
        dealName: newDeal.company,
      });
      
      // Trigger webhook for new deal
      triggerWebhookSync(userId, 'deals', 'INSERT', data as unknown as Record<string, unknown>);

      // ── HubSpot deal sync (forward-only, fire-and-forget) ──
      supabase.functions.invoke('hubspot-create-deal', {
        body: { deal_id: data.id },
      }).then(({ error: hsErr }) => {
        if (hsErr) {
          console.error('[HubSpot sync] Edge function error:', hsErr);
        }
      });

      // Auto-populate Outstanding Items for Active Pipeline deals on creation
      if (memberData?.company_id && dealData.dealTypes && dealData.dealTypes.length > 0) {
        try {
          const effectivePipelineId = (data as any).pipeline_id || null;
          const isActive = await isActivePipeline(effectivePipelineId, memberData.company_id);
          if (isActive) {
            const initialResult = await autoPopulateOutstandingItems(
              newDeal.id, dealData.dealTypes, memberData.company_id, userId, 'initial items'
            );
            console.log('[CreateDeal] Initial Items auto-populate:', initialResult);

            // Also check if deal was created directly in Final Credit Items
            const createdStage = (data as any).stage as string;
            if (isFinalCreditItemsStage(createdStage)) {
              const kickoffResult = await autoPopulateOutstandingItems(
                newDeal.id, dealData.dealTypes, memberData.company_id, userId, 'kick off'
              );
              console.log('[CreateDeal] Kick Off auto-populate (created in Final Credit Items):', kickoffResult);
            }
          }
        } catch (err) {
          console.error('[CreateDeal] Error auto-populating outstanding items:', err);
        }
      }

      // Demo Access tenant only: seed a realistic funding-source roster
      // (varied stages / statuses / tasks) drawn from the demo directory.
      seedDemoDealFundingSources(newDeal.id, userId, memberData?.company_id ?? null)
        .catch((e) => console.error('[CreateDeal] demo lender seed failed', e));

      return newDeal;
    } catch (err) {
      console.error('Error creating deal:', err);
      toast({
        title: "Error",
        description: "Failed to create deal",
        variant: "destructive",
      });
      return null;
    }
  }, [userId]);

  // Update a deal (optimistic)
  const updateDeal = useCallback(async (dealId: string, updates: Partial<Deal>) => {
    // Store previous state for rollback
    const previousDeals = deals;
    let previousDeal = deals.find(d => d.id === dealId);

    if (!previousDeal) {
      const { data: dbDeal, error: previousDealError } = await supabase
        .from('deals')
        .select('id, company, deal_class, mrr, one_time_revenue, value, stage, status, pipeline_id, manager, deal_owner')
        .eq('id', dealId)
        .maybeSingle();

      if (previousDealError) {
        throw previousDealError;
      }

      if (dbDeal) {
        previousDeal = {
          id: dbDeal.id,
          name: dbDeal.company || '',
          company: dbDeal.company || '',
          lender: '',
          contact: '',
          value: Number((dbDeal as any).value || 0),
          totalFee: 0,
          stage: ((dbDeal as any).stage || '') as DealStage,
          status: ((dbDeal as any).status || null) as DealStatus | null,
          engagementType: 'advisory',
          manager: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pipelineId: ((dbDeal as any).pipeline_id as string | null) || undefined,
          dealClass: (((dbDeal as any).deal_class || 'standard') as Deal['dealClass']) || 'standard',
          mrr: (dbDeal as any).mrr ?? null,
          oneTimeRevenue: (dbDeal as any).one_time_revenue ?? null,
          manager: ((dbDeal as any).manager as string | null) || '',
          dealOwner: ((dbDeal as any).deal_owner as string | null) || undefined,
        } as Deal;
      }
    }
    
    // Auto-move to In Development pipeline when stage is set to 'unresponsive'
    if (updates.stage === 'unresponsive' && previousDeal?.stage !== 'unresponsive') {
      try {
        const { data: membership } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', userId!)
          .maybeSingle();

        if (membership?.company_id) {
          const { data: inDevPipeline } = await supabase
            .from('deal_pipelines')
            .select('id')
            .eq('company_id', membership.company_id)
            .ilike('name', '%in development%')
            .limit(1)
            .maybeSingle();

          if (inDevPipeline) {
            updates = { ...updates, pipelineId: inDevPipeline.id, status: 'on-hold' as DealStatus };
          }
        }
      } catch (err) {
        console.error('Error resolving In Development pipeline:', err);
      }
    }

    // Auto-adjust status based on terminal stage transitions.
    // - closed-won  -> clear status ("No status")
    // - closed-lost -> archived
    // Only apply when the caller didn't explicitly set status in the same update,
    // and only when the stage is actually changing to the terminal value.
    if (updates.stage && updates.stage !== previousDeal?.stage && updates.status === undefined) {
      if (updates.stage === 'closed-won') {
        updates = { ...updates, status: null };
      } else if (updates.stage === 'closed-lost') {
        updates = { ...updates, status: 'archived' as DealStatus };
      }
    }

    // Mark as pending to prevent realtime refetch from overwriting optimistic update
    pendingOptimisticUpdatesRef.current.add(`deal-${dealId}`);

    // FinServ deals: the pipeline-card amount, per-stage Value totals, and
    // Weighted Value KPI all read from `deal.value`. MRR / One-Time Revenue
    // are the underlying user-entered numbers, so whenever either changes
    // we mirror their sum into `value` so every aggregate stays consistent
    // with what the user just typed in the detail modal. Without this the
    // card and dashboard show stale dollars even after a refetch.
    updates = syncFinServValuePatch(updates, previousDeal);

    // Optimistically update UI immediately
    const nowIso = new Date().toISOString();
    setDeals(prev =>
      prev.map(deal =>
        deal.id === dealId
          ? {
              ...deal,
              ...updates,
              updatedAt: nowIso,
              // Mirror the server-side `notes_updated_at = now()` write below
              // so surfaces that read `notesUpdatedAt` (deal tile / list row /
              // detail "X Min. Ago") reflect the fresh status-note update
              // immediately, without waiting for a refetch.
              ...(updates.notes !== undefined ? { notesUpdatedAt: nowIso } : {}),
            }
          : deal
      )
    );

    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.company !== undefined) dbUpdates.company = (updates.company || '').trim();
      if (updates.value !== undefined) dbUpdates.value = updates.value;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
      if (updates.engagementType !== undefined) dbUpdates.engagement_type = updates.engagementType;
      if (updates.exclusivity !== undefined) dbUpdates.exclusivity = updates.exclusivity;
      if (updates.manager !== undefined) dbUpdates.manager = updates.manager;
      if (updates.dealOwner !== undefined) dbUpdates.deal_owner = updates.dealOwner;
      if (updates.analyst !== undefined) dbUpdates.analyst = updates.analyst;
      if (updates.isFlagged !== undefined) dbUpdates.is_flagged = updates.isFlagged;
      if (updates.flagNotes !== undefined) dbUpdates.flag_notes = updates.flagNotes;
      if (Object.prototype.hasOwnProperty.call(updates, 'referredBy')) {
        dbUpdates.referred_by = updates.referredBy?.name ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'referralSourceContactId')) {
        dbUpdates.referral_source_contact_id = (updates as any).referralSourceContactId ?? null;
      }
      if (updates.dealTypes !== undefined) {
        dbUpdates.deal_type = updates.dealTypes.length > 0 ? JSON.stringify(updates.dealTypes) : null;
      }
      if (updates.preSigningHours !== undefined) dbUpdates.pre_signing_hours = updates.preSigningHours;
      if (updates.postSigningHours !== undefined) dbUpdates.post_signing_hours = updates.postSigningHours;
      // total_fee is a generated column in Postgres — never write to it.
      if (updates.retainerFee !== undefined) dbUpdates.retainer_fee = updates.retainerFee;
      if (updates.milestoneFee !== undefined) dbUpdates.milestone_fee = updates.milestoneFee;
      if (updates.successFeePercent !== undefined) dbUpdates.success_fee_percent = updates.successFeePercent;
      if (updates.notes !== undefined) {
        dbUpdates.notes = updates.notes;
        dbUpdates.notes_updated_at = new Date().toISOString();
      }
      if (updates.narrative !== undefined) {
        dbUpdates.narrative = updates.narrative;
      }
      if (updates.contact !== undefined) dbUpdates.contact = updates.contact;
      if (updates.contactInfo !== undefined) dbUpdates.contact_info = updates.contactInfo;
      if (updates.companyUrl !== undefined) dbUpdates.company_url = updates.companyUrl;
      if (updates.businessModel !== undefined) dbUpdates.business_model = updates.businessModel;
      if (updates.closingDate !== undefined) dbUpdates.closing_date = updates.closingDate;
      if (updates.dashboardClosingDate !== undefined) (dbUpdates as any).dashboard_closing_date = updates.dashboardClosingDate;
      if (updates.pipelineId !== undefined) dbUpdates.pipeline_id = updates.pipelineId;
      if (updates.sourcedVia !== undefined) dbUpdates.sourced_via = updates.sourcedVia;

      // Pipeline-specific (FinServ) fields — see src/config/pipelineFieldSchemas.ts
      if ((updates as any).onHold !== undefined) (dbUpdates as any).on_hold = (updates as any).onHold;
      if ((updates as any).contactEmail !== undefined) (dbUpdates as any).contact_email = (updates as any).contactEmail || null;
      if ((updates as any).leadSource !== undefined) (dbUpdates as any).lead_source = (updates as any).leadSource || null;
      if ((updates as any).referralSource !== undefined) (dbUpdates as any).referral_source = (updates as any).referralSource || null;
      if ((updates as any).opportunityType !== undefined) (dbUpdates as any).opportunity_type = (updates as any).opportunityType || null;
      if ((updates as any).servicesOffered !== undefined) (dbUpdates as any).services_offered = (updates as any).servicesOffered ?? [];
      if ((updates as any).feeType !== undefined) (dbUpdates as any).fee_type = (updates as any).feeType || null;
      if ((updates as any).mrr !== undefined) (dbUpdates as any).mrr = (updates as any).mrr;
      if ((updates as any).mrrMode !== undefined) (dbUpdates as any).mrr_mode = (updates as any).mrrMode;
      if ((updates as any).oneTimeRevenue !== undefined) (dbUpdates as any).one_time_revenue = (updates as any).oneTimeRevenue;
      if ((updates as any).projectedCloseDate !== undefined) (dbUpdates as any).projected_close_date = (updates as any).projectedCloseDate;
      if ((updates as any).contractStartDate !== undefined) (dbUpdates as any).contract_start_date = (updates as any).contractStartDate;
      if ((updates as any).contractEndDate !== undefined) (dbUpdates as any).contract_end_date = (updates as any).contractEndDate;

      // Pipeline-specific (Naitive) fields — mirrors CreateNaitiveDealDialog.
      if ((updates as any).icpCategory !== undefined) (dbUpdates as any).icp_category = (updates as any).icpCategory || null;
      if ((updates as any).prospectType !== undefined) (dbUpdates as any).prospect_type = (updates as any).prospectType || null;
      if ((updates as any).ownedBy !== undefined) (dbUpdates as any).owned_by = (updates as any).ownedBy || null;
      if ((updates as any).contactTitle !== undefined) (dbUpdates as any).contact_title = (updates as any).contactTitle || null;
      if ((updates as any).nextStep !== undefined) (dbUpdates as any).next_step = (updates as any).nextStep || null;
      if ((updates as any).nextStepDate !== undefined) (dbUpdates as any).next_step_date = (updates as any).nextStepDate || null;
      if ((updates as any).dmPresent !== undefined) (dbUpdates as any).dm_present = (updates as any).dmPresent || null;
      if ((updates as any).dmName !== undefined) (dbUpdates as any).dm_name = (updates as any).dmName || null;
      if ((updates as any).outcome !== undefined) (dbUpdates as any).outcome = (updates as any).outcome || null;
      if ((updates as any).whyNotMovingForward !== undefined) {
        const v = (updates as any).whyNotMovingForward;
        (dbUpdates as any).why_not_moving_forward = Array.isArray(v) ? v : (v ? [v] : []);
      }
      // Protected text fields — pass the value through as-is (including empty
      // string). A DB-level BEFORE UPDATE trigger (deals_prevent_protected_
      // nullification) will restore the prior value if the client tries to
      // null/blank a previously-set field. To intentionally clear one of these
      // fields, callers must go through a dedicated RPC that sets
      // `app.allow_clear = 'on'` for that transaction.
      // NOTE: we keep the `!== undefined` guard so omitted keys are NOT sent —
      // this guarantees a true partial PATCH.
      if ((updates as any).painPointsConfirmed !== undefined) (dbUpdates as any).pain_points_confirmed = (updates as any).painPointsConfirmed ?? '';
      if ((updates as any).objectionsRaised !== undefined) (dbUpdates as any).objections_raised = (updates as any).objectionsRaised ?? '';
      if ((updates as any).competitorsMentioned !== undefined) (dbUpdates as any).competitors_mentioned = (updates as any).competitorsMentioned ?? '';
      if ((updates as any).keySignal !== undefined) (dbUpdates as any).key_signal = (updates as any).keySignal ?? '';
      if ((updates as any).productGapFlagged !== undefined) (dbUpdates as any).product_gap_flagged = (updates as any).productGapFlagged ?? '';

      const { error } = await supabase
        .from('deals')
        .update(dbUpdates)
        .eq('id', dealId);

      if (error) throw error;

      if (previousDeal?.dealClass === 'finserv') {
        window.dispatchEvent(new CustomEvent('finserv:deal-updated', {
          detail: {
            dealId,
            value: updates.value,
            mrr: (updates as any).mrr,
            oneTimeRevenue: (updates as any).oneTimeRevenue,
          },
        }));
      }

      // Toast when a stage change pushes the deal out of the FLEx marketplace.
      // The DB trigger already fires the unpublish — this just surfaces feedback.
      if (
        updates.stage !== undefined &&
        previousDeal &&
        updates.stage !== previousDeal.stage &&
        isFlexHiddenStage(updates.stage) &&
        !isFlexHiddenStage(previousDeal.stage)
      ) {
        try {
          const { data: lastSuccess } = await supabase
            .from('flex_sync_history')
            .select('id')
            .eq('deal_id', dealId)
            .eq('status', 'success')
            .limit(1)
            .maybeSingle();
          if (lastSuccess) {
            toast({
              title: 'Removed from FLEx',
              description: `${previousDeal.company} has been removed from FLEx (stage: ${prettyStageLabel(updates.stage as string)}).`,
            });
          }
        } catch (e) {
          /* non-fatal */
        }
      }

      // Auto-populate Outstanding Items when deal moves to Active Pipeline
      if (updates.pipelineId && previousDeal && updates.pipelineId !== previousDeal.pipelineId) {
        try {
          const { data: membership } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', userId!)
            .maybeSingle();
          const companyId = membership?.company_id;
          if (companyId) {
            const isActive = await isActivePipeline(updates.pipelineId, companyId);
            if (isActive) {
              const { data: dealRecord } = await supabase
                .from('deals')
                .select('deal_type, stage')
                .eq('id', dealId)
                .single();
              const dealTypes: string[] = dealRecord?.deal_type
                ? (() => { try { return JSON.parse(dealRecord.deal_type); } catch { return []; } })()
                : [];
              if (dealTypes.length > 0) {
                const initialResult = await autoPopulateOutstandingItems(dealId, dealTypes, companyId, userId!);
                console.log('[UpdateDeal] Pipeline move Initial Items:', initialResult);

                // If the deal is already at Final Credit Items when moved, also populate Kick Off
                const currentStage = updates.stage ?? dealRecord?.stage;
                if (isFinalCreditItemsStage(currentStage)) {
                  const kickoffResult = await autoPopulateOutstandingItems(dealId, dealTypes, companyId, userId!, 'kick off');
                  console.log('[UpdateDeal] Pipeline move + Final Credit Items Kick Off:', kickoffResult);
                }
              }
            }
          }
        } catch (err) {
          console.error('Error auto-populating outstanding items on pipeline move:', err);
        }
      }

      // Auto-populate Kick Off items when deal enters Final Credit Items in Active Pipeline
      if (updates.stage && previousDeal && isFinalCreditItemsStage(updates.stage) && !isFinalCreditItemsStage(previousDeal.stage)) {
        try {
          const { data: membership } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', userId!)
            .maybeSingle();
          const companyId = membership?.company_id;
          if (companyId) {
            const effectivePipelineId = updates.pipelineId ?? previousDeal?.pipelineId ?? null;
            const isActive = await isActivePipeline(effectivePipelineId, companyId);
            if (isActive) {
              const { data: dealRecord } = await supabase
                .from('deals')
                .select('deal_type')
                .eq('id', dealId)
                .single();
              const dealTypes: string[] = dealRecord?.deal_type
                ? (() => { try { return JSON.parse(dealRecord.deal_type); } catch { return []; } })()
                : [];
              if (dealTypes.length > 0) {
                const kickoffResult = await autoPopulateOutstandingItems(dealId, dealTypes, companyId, userId!, 'kick off');
                console.log('[UpdateDeal] Stage entry Final Credit Items Kick Off:', kickoffResult);
              }
            }
          }
        } catch (err) {
          console.error('Error auto-populating Kick Off items on Final Credit Items stage entry:', err);
        }
      }

      // Auto-populate Initial Items when deal enters NDA/Needs List Sent in Active Pipeline.
      // Mirrors the Final Credit Items → Kick Off pattern. Re-adds any missing Initial Items
      // (e.g. deal was imported or items were manually deleted) without duplicating existing ones.
      if (
        updates.stage &&
        previousDeal &&
        isNdaNeedsListSentStage(updates.stage) &&
        !isNdaNeedsListSentStage(previousDeal.stage)
      ) {
        try {
          const { data: membership } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', userId!)
            .maybeSingle();
          const companyId = membership?.company_id;
          if (companyId) {
            const effectivePipelineId = updates.pipelineId ?? previousDeal?.pipelineId ?? null;
            const isActive = await isActivePipeline(effectivePipelineId, companyId);
            if (isActive) {
              const { data: dealRecord } = await supabase
                .from('deals')
                .select('deal_type')
                .eq('id', dealId)
                .single();
              const dealTypes: string[] = dealRecord?.deal_type
                ? (() => { try { return JSON.parse(dealRecord.deal_type); } catch { return []; } })()
                : [];
              if (dealTypes.length > 0) {
                const initialResult = await autoPopulateOutstandingItems(
                  dealId, dealTypes, companyId, userId!, 'initial items'
                );
                console.log('[UpdateDeal] Stage entry NDA/Needs List Sent Initial Items:', initialResult);

                if (initialResult.inserted > 0) {
                  await supabase.from('activity_logs').insert({
                    deal_id: dealId,
                    user_id: userId,
                    activity_type: 'outstanding_items_auto_populated',
                    description: `Auto-added ${initialResult.inserted} Initial Item(s) on entry to NDA/Needs List Sent`,
                    metadata: {
                      trigger: 'stage_entered_nda_needs_list_sent',
                      round: 'initial items',
                      inserted: initialResult.inserted,
                      skipped_duplicates: initialResult.skippedDuplicates,
                      matched_deal_type: initialResult.matchedDealType,
                    },
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error('Error auto-populating Initial Items on NDA/Needs List Sent stage entry:', err);
        }
      }

      // Auto-create stage-triggered Default Milestones when a deal enters a new stage.
      // Generic mechanism — any company can configure default_milestones with
      // timing_type='from_stage_entry' and a trigger_stage. Dedupe by case-insensitive title
      // within the deal so re-entering a stage does not create duplicates.
      if (updates.stage && previousDeal && updates.stage !== previousDeal.stage) {
        try {
          const { data: membership } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', userId!)
            .maybeSingle();
          const companyId = membership?.company_id;
          if (companyId) {
            const { data: stageDefaults } = await supabase
              .from('default_milestones' as any)
              .select('title, days_from_stage')
              .eq('company_id', companyId)
              .eq('timing_type', 'from_stage_entry')
              .eq('trigger_stage', updates.stage);

            const stageRows = (stageDefaults as any[]) || [];
            if (stageRows.length > 0) {
              const { data: existingMilestones } = await supabase
                .from('deal_milestones')
                .select('title, position')
                .eq('deal_id', dealId);
              const existingTitles = new Set(
                (existingMilestones || []).map((m: any) => String(m.title || '').toLowerCase().trim())
              );
              let nextPosition = (existingMilestones || []).length > 0
                ? Math.max(...(existingMilestones || []).map((m: any) => m.position ?? 0)) + 1
                : 0;
              const now = new Date();
              const toInsert = stageRows
                .filter((row) => !existingTitles.has(String(row.title || '').toLowerCase().trim()))
                .map((row) => {
                  const days = row.days_from_stage;
                  const dueDate = typeof days === 'number' && days >= 0
                    ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
                    : null;
                  return {
                    deal_id: dealId,
                    user_id: userId,
                    title: row.title,
                    due_date: dueDate,
                    completed: false,
                    completed_at: null,
                    position: nextPosition++,
                  };
                });
              if (toInsert.length > 0) {
                await supabase.from('deal_milestones').insert(toInsert);
              }
            }
          }
        } catch (err) {
          console.error('Error auto-creating stage-triggered milestones:', err);
        }
      }

      // Auto-dismiss notifications when deal moves to archived or in_development
      if (updates.status && ['archived', 'in_development'].includes(updates.status)) {
        // Mark all activity_logs-based notifications as seen by updating localStorage
        const lastReadKey = 'latest-updates-last-read-at';
        const now = new Date().toISOString();
        localStorage.setItem(lastReadKey, now);
        
        // Also mark deal-specific updates as seen
        const seenKey = `deal_updates_seen_${dealId}`;
        localStorage.setItem(seenKey, now);
        
        // Dismiss flex_info_notifications for this deal
        supabase
          .from('flex_info_notifications')
          .update({ status: 'dismissed' })
          .eq('deal_id', dealId)
          .in('status', ['pending', 'read'])
          .then(({ error: dismissError }) => {
            if (dismissError) console.error('Error dismissing notifications:', dismissError);
          });
      }

      // Trigger workflows for stage changes
      if (updates.stage && previousDeal && previousDeal.stage !== updates.stage) {
        triggerWorkflow('deal_stage_change', {
          dealId,
          dealName: previousDeal.company,
          fromStage: previousDeal.stage,
          toStage: updates.stage,
        });
        
        // Check for deal closed trigger (stage is 'closed-won' or 'closed-lost')
        if (updates.stage === 'closed-won' || updates.stage === 'closed-lost') {
          triggerWorkflow('deal_closed', {
            dealId,
            dealName: previousDeal.company,
            status: updates.stage,
          });
        }

        // Email workflow triggers (fire-and-forget, never auto-sends)
        (async () => {
          try {
            const { data: mem } = await supabase
              .from('company_members')
              .select('company_id')
              .eq('user_id', userId!)
              .maybeSingle();
            if (mem?.company_id) {
              // Resolve pipeline name for tenant-scoped pipeline matching.
              const effectivePipelineId =
                (updates as any).pipelineId ?? previousDeal.pipelineId ?? null;
              let pipelineName: string | null = null;
              if (effectivePipelineId) {
                const { data: pipe } = await supabase
                  .from('deal_pipelines')
                  .select('name')
                  .eq('id', effectivePipelineId)
                  .maybeSingle();
                pipelineName = (pipe as any)?.name || null;
              }

              await checkStageChangeWorkflows(
                {
                  dealId,
                  companyId: mem.company_id,
                  dealName: previousDeal.company || '',
                  facilitySize: previousDeal.value,
                  lenderCount: previousDeal.lenders?.length,
                  pipelineId: effectivePipelineId,
                  pipelineName,
                },
                updates.stage!,
                previousDeal.stage
              );
            }
          } catch (err) {
            console.error('Email workflow trigger error:', err);
          }
        })();
      }
      
      // Trigger webhook for deal update
      if (userId && previousDeal) {
        const updatedDeal = { ...previousDeal, ...updates };
        triggerWebhookSync(
          userId, 
          'deals', 
          'UPDATE', 
          updatedDeal as unknown as Record<string, unknown>,
          previousDeal as unknown as Record<string, unknown>
        );
      }

      // ── HubSpot update sync (fire-and-forget) ──
      if (previousDeal) {
        const stageChanged = updates.stage !== undefined && updates.stage !== previousDeal.stage;
        const pipelineChanged = updates.pipelineId !== undefined && updates.pipelineId !== previousDeal.pipelineId;
        const amountChanged = updates.value !== undefined && updates.value !== previousDeal.value;

        if (stageChanged || pipelineChanged || amountChanged) {
          supabase
            .from('deals')
            .select('hubspot_deal_id, company_id')
            .eq('id', dealId)
            .maybeSingle()
            .then(({ data: dealRow }) => {
              if (dealRow?.hubspot_deal_id) {
                const effectiveStage = updates.stage ?? previousDeal.stage;
                const effectivePipelineId = updates.pipelineId ?? previousDeal.pipelineId;
                const effectiveAmount = updates.value ?? previousDeal.value;

                supabase.functions.invoke('hubspot-deal-stage-push', {
                  body: {
                    deal_id: dealId,
                    pipeline_id: effectivePipelineId,
                    stage: effectiveStage,
                    hubspot_deal_id: dealRow.hubspot_deal_id,
                    company_id: dealRow.company_id,
                    amount: effectiveAmount,
                  },
                }).then(({ error: hsErr }) => {
                  if (hsErr) console.error('[HubSpot update sync] Edge function error:', hsErr);
                });
              }
            });
        }
      }
    } catch (err) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error updating deal:', err);
      toast({
        title: "Error",
        description: "Failed to update deal",
        variant: "destructive",
      });
    } finally {
      // Clear pending flag after a delay to allow realtime to settle
      setTimeout(() => {
        pendingOptimisticUpdatesRef.current.delete(`deal-${dealId}`);
      }, 2000);
    }
  }, [deals]);

  // Update deal status
  const updateDealStatus = useCallback(async (dealId: string, newStatus: DealStatus | null) => {
    await updateDeal(dealId, { status: newStatus });
  }, [updateDeal]);

  // Add lender to deal
  const addLenderToDeal = useCallback(async (dealId: string, lenderData: Partial<DealLender>): Promise<DealLender | null> => {
    try {
      // Resolve master_lender_id (funding source FK) before inserting.
      // Every deal_lender MUST link to a row in the deal's tenant master_lenders table.
      // A DB trigger enforces this; we do the resolution here so all callsites — even
      // legacy ones that only pass a free-text name — end up with a real, tenant-scoped
      // funding source instead of an orphan string.
      let masterLenderId: string | null = (lenderData as any).masterLenderId ?? null;
      const rawName = (lenderData.name || '').trim();

      if (!masterLenderId) {
        // Get the deal's tenant.
        const { data: dealRow, error: dealErr } = await supabase
          .from('deals')
          .select('company_id, user_id')
          .eq('id', dealId)
          .single();
        if (dealErr || !dealRow) throw dealErr || new Error('Deal not found');

        if (!dealRow.company_id) {
          throw new Error('Cannot attach funding source: deal has no tenant (company_id is null)');
        }

        const lookupName = rawName || 'New Funding Source';

        // Look up an existing funding source in the SAME tenant by case-insensitive name.
        const { data: existing } = await supabase
          .from('master_lenders')
          .select('id, name')
          .eq('company_id', dealRow.company_id)
          .ilike('name', lookupName)
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          masterLenderId = existing.id;
        } else {
          // Auto-create in the tenant's Funding Sources database, then attach.
          // Keeps data integrity (no orphans, no cross-tenant references) while
          // never silently dropping the name the caller supplied.
          const { data: created, error: createErr } = await supabase
            .from('master_lenders')
            .insert({
              user_id: dealRow.user_id,
              company_id: dealRow.company_id,
              name: lookupName,
              lender_type: 'Auto-created',
            })
            .select('id')
            .single();
          if (createErr || !created) throw createErr || new Error('Failed to create funding source');
          masterLenderId = created.id;
        }
      }

      // Default all newly-added funding sources to the "On Deck" stage so the
      // team can triage them from a single bucket before they're actively
      // worked. Callers can still override by passing an explicit `stage`.
      const resolvedStage = lenderData.stage || 'on-deck';
      const { data, error } = await supabase
        .from('deal_lenders')
        .insert({
          deal_id: dealId,
          name: rawName || 'New Funding Source',
          master_lender_id: masterLenderId,
          stage: resolvedStage,
          substage: lenderData.substage || null,
          notes: lenderData.notes || null,
          ...(resolvedStage === 'on-deck' ? { on_deck_at: new Date().toISOString() } : {}),
        })
        .select()
        .single();

      if (error) throw error;

      const newLender: DealLender = {
        id: data.id,
        name: data.name,
        status: 'in-review',
        stage: data.stage,
        substage: data.substage || undefined,
        trackingStatus: 'active',
        notes: data.notes || undefined,
        updatedAt: data.updated_at,
        createdAt: data.created_at,
        submittedAt: (data as any).submitted_at ?? null,
        approvedAt: (data as any).approved_at ?? null,
        passedAt: (data as any).passed_at ?? null,
        declinedAt: (data as any).declined_at ?? null,
        excludedAt: (data as any).excluded_at ?? null,
        onHoldAt: (data as any).on_hold_at ?? null,
        onDeckAt: (data as any).on_deck_at ?? null,
        lastStatusChangeAt: (data as any).last_status_change_at ?? null,
      };

      setDeals(prev =>
        prev.map(deal =>
          deal.id === dealId
            ? { ...deal, lenders: [...(deal.lenders || []), newLender], updatedAt: new Date().toISOString() }
            : deal
        )
      );

      // Trigger webhook for new lender
      if (userId) {
        triggerWebhookSync(userId, 'deal_lenders', 'INSERT', data as unknown as Record<string, unknown>);
      }

      try {
        const { logUsage } = await import('@/lib/usageLogger');
        const existingNames = new Set(
          (deals.find(d => d.id === dealId)?.lenders || []).map(l => (l.name || '').toLowerCase())
        );
        const isResubmission = existingNames.has((data.name || '').toLowerCase());
        logUsage({
          feature_type: 'LENDER_SUBMISSION',
          feature_subtype: isResubmission ? 're_submission' : 'new_submission',
          deal_id: dealId,
          metadata: { lender_name: data.name, stage: data.stage },
        });
      } catch { /* ignore */ }

      return newLender;
    } catch (err) {
      console.error('Error adding lender:', err);
      toast({
        title: "Error",
        description: "Failed to add lender",
        variant: "destructive",
      });
      return null;
    }
  }, []);

  // Update lender (optimistic)
  const updateLender = useCallback(async (lenderId: string, updates: Partial<DealLender>) => {
    // Store previous state for rollback
    const previousDeals = deals;
    
    // Mark this lender as having a pending optimistic update
    pendingOptimisticUpdatesRef.current.add(lenderId);
    
    // Find the lender and its deal for workflow triggering
    let previousLender: DealLender | undefined;
    let dealId: string | undefined;
    let dealName: string | undefined;
    for (const deal of deals) {
      const lender = deal.lenders?.find(l => l.id === lenderId);
      if (lender) {
        previousLender = lender;
        dealId = deal.id;
        dealName = deal.company;
        break;
      }
    }
    
    // Optimistically update UI immediately
    setDeals(prev =>
      prev.map(deal => ({
        ...deal,
        lenders: deal.lenders?.map(l => {
          if (l.id !== lenderId) return l;
          
          // If notes are being updated and there was a previous note, add to history
          let updatedHistory = l.notesHistory || [];
          if (updates.notes !== undefined && l.notes && l.notes.trim() !== '' && updates.notes !== l.notes) {
            updatedHistory = [{ text: l.notes, updatedAt: new Date().toISOString() }, ...updatedHistory];
          }
          
          return { 
            ...l, 
            ...updates, 
            notesHistory: updatedHistory,
            updatedAt: new Date().toISOString() 
          };
        }),
      }))
    );

    try {
      // If notes are being updated and there was a previous note, save to history
      if (updates.notes !== undefined && previousLender?.notes && previousLender.notes.trim() !== '' && updates.notes !== previousLender.notes) {
        await supabase
          .from('lender_notes_history')
          .insert({
            deal_lender_id: lenderId,
            text: previousLender.notes,
          });
      }
      
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
      if (updates.substage !== undefined) dbUpdates.substage = updates.substage;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      // Handle passReason - use null to clear, or the value to set
      if ('passReason' in updates) dbUpdates.pass_reason = updates.passReason ?? null;
      if (updates.trackingStatus !== undefined) dbUpdates.tracking_status = updates.trackingStatus;
      if ('score' in updates) dbUpdates.score = updates.score ?? null;
      
      // Always update the updated_at timestamp
      dbUpdates.updated_at = new Date().toISOString();

      // Only make db call if we have meaningful updates (beyond just updated_at)
      if (Object.keys(dbUpdates).length > 1) {
        console.log(`[updateLender] Updating lender ${lenderId} with:`, dbUpdates);
        
        const { data, error } = await supabase
          .from('deal_lenders')
          .update(dbUpdates)
          .eq('id', lenderId)
          .select();

        if (error) {
          console.error(`[updateLender] Database error for lender ${lenderId}:`, error);
          throw error;
        }
        
        // Treat 0 rows updated as a hard failure – rollback immediately
        if (!data || data.length === 0) {
          console.error(`[updateLender] No rows updated for lender ${lenderId}. RLS policy likely blocked the update – rolling back.`);
          // Rollback optimistic update
          setDeals(previousDeals);
          toast({
            title: "Save failed",
            description: "Your change could not be saved. Please try again.",
            variant: "destructive",
          });
          return; // Exit early – do not continue with activity logs / webhooks
        }

        // Show success toast based on what was updated
        if (updates.stage !== undefined || updates.trackingStatus !== undefined) {
          toast({
            title: "Stage updated",
            description: `Lender stage saved successfully`,
          });
        } else if (updates.substage !== undefined) {
          toast({
            title: "Milestone updated",
            description: `Lender milestone saved successfully`,
          });
        } else if (updates.notes !== undefined) {
          toast({
            title: "Notes saved",
            description: `Lender notes saved successfully`,
          });
        }
      }
      
      // Log activity for lender stage changes
      if (updates.stage && previousLender && previousLender.stage !== updates.stage && dealId) {
        // Log activity
        await supabase.from('activity_logs').insert({
          deal_id: dealId,
          activity_type: 'lender_stage_change',
          description: `${previousLender.name} stage changed from ${previousLender.stage} to ${updates.stage}`,
          metadata: {
            lender_id: lenderId,
            lender_name: previousLender.name,
            from: previousLender.stage,
            to: updates.stage,
          },
        });
        
        // Trigger workflow for lender stage changes
        triggerWorkflow('lender_stage_change', {
          dealId,
          dealName,
          lenderId,
          lenderName: previousLender.name,
          fromStage: previousLender.stage,
          toStage: updates.stage,
        });
      }
      
      // Log activity for lender substage (milestone) changes
      if (updates.substage !== undefined && previousLender && previousLender.substage !== updates.substage && dealId) {
        await supabase.from('activity_logs').insert({
          deal_id: dealId,
          activity_type: 'lender_substage_change',
          description: `${previousLender.name} milestone changed from ${previousLender.substage || 'None'} to ${updates.substage || 'None'}`,
          metadata: {
            lender_id: lenderId,
            lender_name: previousLender.name,
            from: previousLender.substage || null,
            to: updates.substage || null,
          },
        });
      }
      
      // Trigger webhook for lender update
      if (userId && previousLender) {
        const updatedLender = { ...previousLender, ...updates, deal_id: dealId };
        triggerWebhookSync(
          userId, 
          'deal_lenders', 
          'UPDATE', 
          updatedLender as unknown as Record<string, unknown>,
          { ...previousLender, deal_id: dealId } as unknown as Record<string, unknown>
        );
      }

      // Lender notification batching is now handled by the DB trigger
      // (notify_email_on_lender_event queues into pending_lender_notifications)
    } catch (err: any) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error updating lender:', err);
      const errMsg = err?.message || 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to update lender: ${errMsg}`,
        variant: "destructive",
      });
    } finally {
      // Clear the pending optimistic update after a delay to allow realtime to settle
      setTimeout(() => {
        pendingOptimisticUpdatesRef.current.delete(lenderId);
      }, 2000);
    }
  }, [deals]);

  // Delete lender (optimistic)
  const deleteLender = useCallback(async (lenderId: string) => {
    // Store previous state for rollback
    const previousDeals = deals;
    
    // Optimistically remove from UI immediately
    setDeals(prev =>
      prev.map(deal => ({
        ...deal,
        lenders: deal.lenders?.filter(l => l.id !== lenderId),
      }))
    );

    try {
      // Find the lender data before deletion for webhook
      let deletedLender: DealLender | undefined;
      let dealId: string | undefined;
      for (const deal of previousDeals) {
        const lender = deal.lenders?.find(l => l.id === lenderId);
        if (lender) {
          deletedLender = lender;
          dealId = deal.id;
          break;
        }
      }
      
      const { error } = await supabase
        .from('deal_lenders')
        .delete()
        .eq('id', lenderId);

      if (error) throw error;
      
      // Trigger webhook for lender deletion
      if (userId && deletedLender) {
        triggerWebhookSync(
          userId, 
          'deal_lenders', 
          'DELETE', 
          null,
          { ...deletedLender, deal_id: dealId } as unknown as Record<string, unknown>
        );
      }
    } catch (err) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error deleting lender:', err);
      toast({
        title: "Error",
        description: "Failed to delete lender",
        variant: "destructive",
      });
    }
  }, [deals]);

  // Delete deal (optimistic)
  const deleteDeal = useCallback(async (dealId: string) => {
    // Store previous state for rollback
    const previousDeals = deals;
    
    // Optimistically remove from UI immediately
    setDeals(prev => prev.filter(d => d.id !== dealId));

    try {
      // Get the deal data before deletion for webhook
      const deletedDeal = previousDeals.find(d => d.id === dealId);
      
      // First check if the deal exists and we can see it
      const { data: existingDeal } = await supabase
        .from('deals')
        .select('id')
        .eq('id', dealId)
        .maybeSingle();

      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);

      if (error) throw error;
      
      // If the deal still exists after delete, permission was denied
      const { data: stillExists } = await supabase
        .from('deals')
        .select('id')
        .eq('id', dealId)
        .maybeSingle();
      
      if (stillExists && existingDeal) {
        throw new Error('You do not have permission to delete this deal');
      }
      
      // Trigger webhook for deal deletion
      if (userId && deletedDeal) {
        triggerWebhookSync(
          userId, 
          'deals', 
          'DELETE', 
          null,
          deletedDeal as unknown as Record<string, unknown>
        );
      }
    } catch (err: any) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error deleting deal:', err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete deal. You may not have permission.",
        variant: "destructive",
      });
    }
  }, [deals]);

  // Delete lender note history
  const deleteLenderNoteHistory = useCallback(async (noteId: string, lenderId: string) => {
    // Store previous state for rollback
    const previousDeals = deals;
    
    // Optimistically remove from UI immediately
    setDeals(prev => prev.map(deal => ({
      ...deal,
      lenders: deal.lenders?.map(lender => 
        lender.id === lenderId 
          ? { ...lender, notesHistory: lender.notesHistory?.filter(n => n.id !== noteId) }
          : lender
      )
    })));

    try {
      const { error } = await supabase
        .from('lender_notes_history')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
    } catch (err) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error deleting lender note history:', err);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    }
  }, [deals]);

  // Get a single deal by ID
  const getDealById = useCallback((dealId: string): Deal | undefined => {
    return deals.find(d => d.id === dealId);
  }, [deals]);

  // Debounced refetch for realtime updates - skips if optimistic updates are pending
  const debouncedRealtimeRefetch = useCallback(() => {
    // Clear any pending refetch
    if (realtimeRefetchTimeoutRef.current) {
      clearTimeout(realtimeRefetchTimeoutRef.current);
    }
    
    // If there are pending optimistic updates, delay the refetch
    if (pendingOptimisticUpdatesRef.current.size > 0) {
      // Schedule a delayed refetch after optimistic updates should be complete
      realtimeRefetchTimeoutRef.current = setTimeout(() => {
        if (pendingOptimisticUpdatesRef.current.size === 0) {
          fetchDeals();
        }
      }, 2500);
      return;
    }
    
    // Debounce rapid realtime events
    realtimeRefetchTimeoutRef.current = setTimeout(() => {
      fetchDeals();
    }, 300);
  }, [fetchDeals]);

  // Initial fetch and realtime subscription
  useEffect(() => {
    fetchDeals();

    // Subscribe to realtime changes on deals table
    const dealsChannel = supabase
      .channel('deals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        (payload) => {
          console.log('[Realtime] Deals change detected:', payload.eventType);
          debouncedRealtimeRefetch();
        }
      )
      .subscribe();

    // Subscribe to realtime changes on deal_lenders table
    const lendersChannel = supabase
      .channel('deal-lenders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_lenders'
        },
        (payload) => {
          console.log('[Realtime] Deal lenders change detected:', payload.eventType);
          debouncedRealtimeRefetch();
        }
      )
      .subscribe();

    // Subscribe to realtime changes on deal_milestones table
    const milestonesChannel = supabase
      .channel('deal-milestones-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_milestones'
        },
        (payload) => {
          console.log('[Realtime] Deal milestones change detected:', payload.eventType);
          debouncedRealtimeRefetch();
        }
      )
      .subscribe();

    // Subscribe to realtime changes on deal_status_notes table
    const statusNotesChannel = supabase
      .channel('deal-status-notes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_status_notes'
        },
        (payload) => {
          console.log('[Realtime] Deal status notes change detected:', payload.eventType);
          debouncedRealtimeRefetch();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(lendersChannel);
      supabase.removeChannel(milestonesChannel);
      supabase.removeChannel(statusNotesChannel);
      if (realtimeRefetchTimeoutRef.current) {
        clearTimeout(realtimeRefetchTimeoutRef.current);
      }
    };
  }, [fetchDeals]);

  return {
    deals,
    isLoading,
    error,
    fetchDeals,
    createDeal,
    updateDeal,
    updateDealStatus,
    addLenderToDeal,
    updateLender,
    deleteLender,
    deleteLenderNoteHistory,
    deleteDeal,
    getDealById,
  };
}

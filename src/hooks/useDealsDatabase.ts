import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Deal, DealLender, DealStatus, DealStage, EngagementType, ExclusivityType, Referrer, LenderNoteHistory } from '@/types/deal';
import { toast } from '@/hooks/use-toast';
import type { TriggerType, WorkflowAction } from '@/components/workflows/WorkflowBuilder';
import { addDays } from 'date-fns';

interface DefaultMilestone {
  id: string;
  title: string;
  daysFromCreation: number;
  position: number;
}

// Get default milestones from localStorage
function getDefaultMilestones(): DefaultMilestone[] {
  try {
    const stored = localStorage.getItem('default-deal-milestones');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load default milestones:', error);
  }
  return [];
}

// Create default milestones for a new deal
async function createDefaultMilestones(dealId: string, userId: string) {
  const defaultMilestones = getDefaultMilestones();
  if (defaultMilestones.length === 0) return;

  const now = new Date();
  const milestonesToInsert = defaultMilestones
    .sort((a, b) => a.position - b.position)
    .map((m, index) => ({
      deal_id: dealId,
      user_id: userId,
      title: m.title,
      due_date: addDays(now, m.daysFromCreation).toISOString(),
      completed: false,
      position: index,
    }));

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
  manager: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  pre_signing_hours: number | null;
  post_signing_hours: number | null;
  total_fee: number | null;
  retainer_fee: number | null;
  milestone_fee: number | null;
  success_fee_percent: number | null;
}

interface DbDealLender {
  id: string;
  deal_id: string;
  name: string;
  stage: string;
  substage: string | null;
  notes: string | null;
  pass_reason: string | null;
  quote_amount: number | null;
  quote_rate: number | null;
  quote_term: string | null;
  created_at: string;
  updated_at: string;
}

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

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch all deals from database
  const fetchDeals = useCallback(async () => {
    if (!userId) {
      setDeals([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data: dbDeals, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .order('updated_at', { ascending: false });

      if (dealsError) throw dealsError;

      if (!dbDeals || dbDeals.length === 0) {
        setDeals([]);
        setIsLoading(false);
        return;
      }

      // Fetch lenders for all deals
      const { data: dbLenders, error: lendersError } = await supabase
        .from('deal_lenders')
        .select('*');

      if (lendersError) throw lendersError;

      // Fetch notes history for all lenders
      const lenderIds = (dbLenders || []).map((l: DbDealLender) => l.id);
      let notesHistoryMap: Record<string, LenderNoteHistory[]> = {};
      
      if (lenderIds.length > 0) {
        const { data: notesHistory } = await supabase
          .from('lender_notes_history')
          .select('*')
          .in('deal_lender_id', lenderIds)
          .order('created_at', { ascending: false });
        
        // Group by lender id
        (notesHistory || []).forEach((nh: any) => {
          if (!notesHistoryMap[nh.deal_lender_id]) {
            notesHistoryMap[nh.deal_lender_id] = [];
          }
          notesHistoryMap[nh.deal_lender_id].push({
            text: nh.text,
            updatedAt: nh.created_at,
          });
        });
      }

      // Map database deals to Deal type
      const mappedDeals: Deal[] = dbDeals.map((dbDeal: DbDeal) => {
        const dealLenders = (dbLenders || [])
          .filter((l: DbDealLender) => l.deal_id === dbDeal.id)
          .map((l: DbDealLender) => ({
            id: l.id,
            name: l.name,
            status: 'in-review' as const,
            stage: l.stage,
            substage: l.substage || undefined,
            trackingStatus: 'active' as const,
            notes: l.notes || undefined,
            passReason: l.pass_reason || undefined,
            updatedAt: l.updated_at,
            notesHistory: notesHistoryMap[l.id] || [],
          }));

        const toReferrer = (name: string | null): Referrer | undefined => {
          if (!name) return undefined;
          return {
            id: `ref-${name.toLowerCase().replace(/\s+/g, '-')}`,
            name,
          };
        };

        return {
          id: dbDeal.id,
          name: dbDeal.company,
          company: dbDeal.company,
          stage: dbDeal.stage as DealStage,
          status: dbDeal.status as DealStatus,
          engagementType: (dbDeal.engagement_type || 'guided') as EngagementType,
          exclusivity: (dbDeal.exclusivity || undefined) as ExclusivityType | undefined,
          manager: dbDeal.manager || 'Paz',
          referredBy: toReferrer(dbDeal.referred_by),
          lender: dealLenders[0]?.name || '',
          value: Number(dbDeal.value),
          totalFee: Number(dbDeal.total_fee || 0),
          retainerFee: Number(dbDeal.retainer_fee || 0),
          milestoneFee: Number(dbDeal.milestone_fee || 0),
          successFeePercent: Number(dbDeal.success_fee_percent || 0),
          preSigningHours: Number(dbDeal.pre_signing_hours || 0),
          postSigningHours: Number(dbDeal.post_signing_hours || 0),
          contact: '',
          createdAt: dbDeal.created_at,
          updatedAt: dbDeal.updated_at,
          lenders: dealLenders,
        };
      });

      setDeals(mappedDeals);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError(err as Error);
      setDeals([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

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
          company: dealData.company || 'New Deal',
          value: dealData.value || 0,
          status: dealData.status || 'on-track',
          stage: dealData.stage || 'final-credit-items',
          engagement_type: dealData.engagementType || 'guided',
          manager: dealData.manager || 'Paz',
          referred_by: dealData.referredBy?.name || null,
          user_id: userId,
          company_id: memberData?.company_id || null,
        })
        .select()
        .single();

      if (error) throw error;

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
        status: data.status as DealStatus,
        engagementType: (data.engagement_type || 'guided') as EngagementType,
        manager: data.manager || 'Paz',
        referredBy: toReferrer(data.referred_by),
        lender: '',
        value: Number(data.value),
        totalFee: Number(data.total_fee || 0),
        retainerFee: Number(data.retainer_fee || 0),
        milestoneFee: Number(data.milestone_fee || 0),
        successFeePercent: Number(data.success_fee_percent || 0),
        preSigningHours: Number(data.pre_signing_hours || 0),
        postSigningHours: Number(data.post_signing_hours || 0),
        contact: '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        lenders: [],
      };

      setDeals(prev => [newDeal, ...prev]);
      
      // Create default milestones for the new deal
      await createDefaultMilestones(newDeal.id, userId);
      
      // Trigger new_deal workflow
      triggerWorkflow('new_deal', {
        dealId: newDeal.id,
        dealName: newDeal.company,
      });
      
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
    const previousDeal = deals.find(d => d.id === dealId);
    
    // Optimistically update UI immediately
    setDeals(prev =>
      prev.map(deal =>
        deal.id === dealId
          ? { ...deal, ...updates, updatedAt: new Date().toISOString() }
          : deal
      )
    );

    try {
      const dbUpdates: Record<string, any> = {};
      if (updates.company !== undefined) dbUpdates.company = updates.company;
      if (updates.value !== undefined) dbUpdates.value = updates.value;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
      if (updates.engagementType !== undefined) dbUpdates.engagement_type = updates.engagementType;
      if (updates.exclusivity !== undefined) dbUpdates.exclusivity = updates.exclusivity;
      if (updates.manager !== undefined) dbUpdates.manager = updates.manager;
      if (Object.prototype.hasOwnProperty.call(updates, 'referredBy')) {
        dbUpdates.referred_by = updates.referredBy?.name ?? null;
      }
      if (updates.preSigningHours !== undefined) dbUpdates.pre_signing_hours = updates.preSigningHours;
      if (updates.postSigningHours !== undefined) dbUpdates.post_signing_hours = updates.postSigningHours;
      if (updates.totalFee !== undefined) dbUpdates.total_fee = updates.totalFee;
      if (updates.retainerFee !== undefined) dbUpdates.retainer_fee = updates.retainerFee;
      if (updates.milestoneFee !== undefined) dbUpdates.milestone_fee = updates.milestoneFee;
      if (updates.successFeePercent !== undefined) dbUpdates.success_fee_percent = updates.successFeePercent;

      const { error } = await supabase
        .from('deals')
        .update(dbUpdates)
        .eq('id', dealId);

      if (error) throw error;
      
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
    }
  }, [deals]);

  // Update deal status
  const updateDealStatus = useCallback(async (dealId: string, newStatus: DealStatus) => {
    await updateDeal(dealId, { status: newStatus });
  }, [updateDeal]);

  // Add lender to deal
  const addLenderToDeal = useCallback(async (dealId: string, lenderData: Partial<DealLender>): Promise<DealLender | null> => {
    try {
      const { data, error } = await supabase
        .from('deal_lenders')
        .insert({
          deal_id: dealId,
          name: lenderData.name || 'New Lender',
          stage: lenderData.stage || 'reviewing-drl',
          substage: lenderData.substage || null,
          notes: lenderData.notes || null,
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
      };

      setDeals(prev =>
        prev.map(deal =>
          deal.id === dealId
            ? { ...deal, lenders: [...(deal.lenders || []), newLender], updatedAt: new Date().toISOString() }
            : deal
        )
      );

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
      if (updates.passReason !== undefined) dbUpdates.pass_reason = updates.passReason;

      const { error } = await supabase
        .from('deal_lenders')
        .update(dbUpdates)
        .eq('id', lenderId);

      if (error) throw error;
      
      // Trigger workflow for lender stage changes
      if (updates.stage && previousLender && previousLender.stage !== updates.stage && dealId) {
        triggerWorkflow('lender_stage_change', {
          dealId,
          dealName,
          lenderId,
          lenderName: previousLender.name,
          fromStage: previousLender.stage,
          toStage: updates.stage,
        });
      }
    } catch (err) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error updating lender:', err);
      toast({
        title: "Error",
        description: "Failed to update lender",
        variant: "destructive",
      });
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
      const { error } = await supabase
        .from('deal_lenders')
        .delete()
        .eq('id', lenderId);

      if (error) throw error;
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
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);

      if (error) throw error;
    } catch (err) {
      // Rollback on error
      setDeals(previousDeals);
      console.error('Error deleting deal:', err);
      toast({
        title: "Error",
        description: "Failed to delete deal",
        variant: "destructive",
      });
    }
  }, [deals]);

  // Get a single deal by ID
  const getDealById = useCallback((dealId: string): Deal | undefined => {
    return deals.find(d => d.id === dealId);
  }, [deals]);

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
        () => {
          fetchDeals();
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
        () => {
          fetchDeals();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(lendersChannel);
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
    deleteDeal,
    getDealById,
  };
}

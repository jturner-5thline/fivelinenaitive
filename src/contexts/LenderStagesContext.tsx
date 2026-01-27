import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { Json } from '@/integrations/supabase/types';

export type StageGroup = 'active' | 'on-deck' | 'passed' | 'on-hold';

export const STAGE_GROUPS: { id: StageGroup; label: string; color: string }[] = [
  { id: 'on-hold', label: 'On Hold', color: 'bg-yellow-500' },
  { id: 'on-deck', label: 'On Deck', color: 'bg-blue-500' },
  { id: 'active', label: 'Active', color: 'bg-green-500' },
  { id: 'passed', label: 'Passed', color: 'bg-red-500' },
];

export interface StageOption {
  id: string;
  label: string;
  group: StageGroup;
}

export interface SubstageOption {
  id: string;
  label: string;
}

export interface PassReasonOption {
  id: string;
  label: string;
}

interface LenderStagesContextType {
  stages: StageOption[];
  addStage: (stage: Omit<StageOption, 'id'>) => void;
  updateStage: (id: string, stage: Partial<Omit<StageOption, 'id'>>) => void;
  deleteStage: (id: string) => void;
  reorderStages: (stages: StageOption[]) => void;
  substages: SubstageOption[];
  addSubstage: (substage: Omit<SubstageOption, 'id'>) => void;
  updateSubstage: (id: string, substage: Omit<SubstageOption, 'id'>) => void;
  deleteSubstage: (id: string) => void;
  reorderSubstages: (substages: SubstageOption[]) => void;
  passReasons: PassReasonOption[];
  addPassReason: (reason: Omit<PassReasonOption, 'id'>) => void;
  updatePassReason: (id: string, reason: Omit<PassReasonOption, 'id'>) => void;
  deletePassReason: (id: string) => void;
  reorderPassReasons: (reasons: PassReasonOption[]) => void;
  getStagesByGroup: (group: StageGroup) => StageOption[];
  isLoading: boolean;
  isSaving: boolean;
}

const LenderStagesContext = createContext<LenderStagesContextType | undefined>(undefined);

const defaultStages: StageOption[] = [
  { id: 'on-deck', label: 'On Deck', group: 'on-deck' },
  { id: 'reviewing-drl', label: 'Reviewing DRL', group: 'active' },
  { id: 'management-call-set', label: 'Management Call Set', group: 'active' },
  { id: 'management-call-completed', label: 'Management Call Completed', group: 'active' },
  { id: 'dd', label: 'Due Diligence', group: 'active' },
  { id: 'draft-terms', label: 'Draft Terms', group: 'active' },
  { id: 'term-sheet', label: 'Term Sheet', group: 'active' },
  { id: 'passed', label: 'Passed', group: 'passed' },
];

const defaultSubstages: SubstageOption[] = [
  { id: 'awaiting-response', label: 'Awaiting Response' },
  { id: 'in-review', label: 'In Review' },
  { id: 'follow-up-needed', label: 'Follow-up Needed' },
  { id: 'scheduled', label: 'Scheduled' },
];

const defaultPassReasons: PassReasonOption[] = [
  { id: 'flat-declining-revenue', label: 'Flat or Declining Revenue Growth' },
  { id: 'low-gross-margins', label: 'Low Gross Margins' },
  { id: 'high-burn-rate', label: 'High Burn Rate' },
  { id: 'runway-liquidity', label: 'Runway / Liquidity Challenges' },
  { id: 'no-path-profitability', label: 'No Clear Path to Profitability/Breakeven' },
  { id: 'customer-concentration', label: 'Customer Concentration' },
  { id: 'metric-issues', label: 'Metric Issues (Inefficient Customer Acquisition, poor LTV/CAC ratio, high S&M spend)' },
  { id: 'overleveraged', label: 'Overleveraged Balance Sheet' },
  { id: 'business-revenue-model', label: 'Business & Revenue Model' },
  { id: 'industry-sector', label: 'Industry or Sector' },
  { id: 'operational-concerns', label: 'Operational Concerns (Management, Key Man Risk, Unreliable Financials)' },
  { id: 'refinancing', label: 'Refinancing Too Much' },
  { id: 'pipeline-challenges', label: 'Pipeline Challenges (too busy, deal size, won\'t make it through committee)' },
  { id: 'no-reason', label: 'No Reason Given' },
  { id: 'other', label: 'Other' },
];

export function LenderStagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [stages, setStages] = useState<StageOption[]>(defaultStages);
  const [substages, setSubstages] = useState<SubstageOption[]>(defaultSubstages);
  const [passReasons, setPassReasons] = useState<PassReasonOption[]>(defaultPassReasons);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

  // Load config from database - prioritize company config for team sharing
  useEffect(() => {
    const loadConfig = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        let data = null;
        let error = null;

        // If user belongs to a company, always use company-level config (shared across team)
        if (company?.id) {
          const result = await supabase
            .from('lender_stage_configs')
            .select('*')
            .eq('company_id', company.id)
            .maybeSingle();
          
          data = result.data;
          error = result.error;
        } else {
          // No company - use personal config
          const result = await supabase
            .from('lender_stage_configs')
            .select('*')
            .eq('user_id', user.id)
            .is('company_id', null)
            .maybeSingle();
          
          data = result.data;
          error = result.error;
        }

        if (error) {
          console.error('Error loading lender stage config:', error);
          loadFromLocalStorage();
        } else if (data) {
          // Load from database - cast through unknown for JSONB columns
          const dbStages = data.stages as unknown as StageOption[];
          const dbSubstages = data.substages as unknown as SubstageOption[];
          const dbPassReasons = data.pass_reasons as unknown as PassReasonOption[];
          
          if (dbStages && Array.isArray(dbStages) && dbStages.length > 0) {
            setStages(dbStages);
          }
          if (dbSubstages && Array.isArray(dbSubstages) && dbSubstages.length > 0) {
            setSubstages(dbSubstages);
          }
          if (dbPassReasons && Array.isArray(dbPassReasons) && dbPassReasons.length > 0) {
            setPassReasons(dbPassReasons);
          }
          setConfigId(data.id);
        } else {
          // No config in database - try to migrate from localStorage
          const migratedFromLocal = loadFromLocalStorage();
          if (migratedFromLocal) {
            await saveToDatabase(stages, substages, passReasons);
          }
        }
      } catch (err) {
        console.error('Error loading config:', err);
        loadFromLocalStorage();
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [user, company?.id]);

  const loadFromLocalStorage = (): boolean => {
    let loaded = false;
    
    const savedStages = localStorage.getItem('lenderStages');
    if (savedStages) {
      try {
        const parsed = JSON.parse(savedStages);
        const migrated = parsed.map((s: any) => ({
          ...s,
          group: s.group || 'active'
        }));
        setStages(migrated);
        loaded = true;
      } catch (e) {
        console.error('Error parsing localStorage stages:', e);
      }
    }

    const savedSubstages = localStorage.getItem('lenderSubstages');
    if (savedSubstages) {
      try {
        setSubstages(JSON.parse(savedSubstages));
        loaded = true;
      } catch (e) {
        console.error('Error parsing localStorage substages:', e);
      }
    }

    const savedPassReasons = localStorage.getItem('lenderPassReasons');
    if (savedPassReasons) {
      try {
        setPassReasons(JSON.parse(savedPassReasons));
        loaded = true;
      } catch (e) {
        console.error('Error parsing localStorage passReasons:', e);
      }
    }

    return loaded;
  };

  const saveToDatabase = useCallback(async (
    newStages: StageOption[],
    newSubstages: SubstageOption[],
    newPassReasons: PassReasonOption[]
  ) => {
    if (!user) return;

    setIsSaving(true);
    try {
      if (configId) {
        // Update existing config (shared across company)
        const { error } = await supabase
          .from('lender_stage_configs')
          .update({
            stages: newStages as unknown as Json,
            substages: newSubstages as unknown as Json,
            pass_reasons: newPassReasons as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', configId);

        if (error) throw error;
      } else {
        // Insert new config - company-level if user belongs to a company
        const { data, error } = await supabase
          .from('lender_stage_configs')
          .insert({
            user_id: user.id,
            company_id: company?.id || null,
            stages: newStages as unknown as Json,
            substages: newSubstages as unknown as Json,
            pass_reasons: newPassReasons as unknown as Json,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (data) setConfigId(data.id);
      }

      // Clear localStorage after successful save to database
      localStorage.removeItem('lenderStages');
      localStorage.removeItem('lenderSubstages');
      localStorage.removeItem('lenderPassReasons');
    } catch (error) {
      console.error('Error saving lender stage config:', error);
      // Fall back to localStorage if database save fails
      localStorage.setItem('lenderStages', JSON.stringify(newStages));
      localStorage.setItem('lenderSubstages', JSON.stringify(newSubstages));
      localStorage.setItem('lenderPassReasons', JSON.stringify(newPassReasons));
    } finally {
      setIsSaving(false);
    }
  }, [user, company?.id, configId]);

  const saveStages = useCallback((newStages: StageOption[]) => {
    setStages(newStages);
    saveToDatabase(newStages, substages, passReasons);
  }, [substages, passReasons, saveToDatabase]);

  const saveSubstages = useCallback((newSubstages: SubstageOption[]) => {
    setSubstages(newSubstages);
    saveToDatabase(stages, newSubstages, passReasons);
  }, [stages, passReasons, saveToDatabase]);

  const savePassReasons = useCallback((newReasons: PassReasonOption[]) => {
    setPassReasons(newReasons);
    saveToDatabase(stages, substages, newReasons);
  }, [stages, substages, saveToDatabase]);

  const addStage = (stage: Omit<StageOption, 'id'>) => {
    const id = stage.label.toLowerCase().replace(/\s+/g, '-');
    const newStage = { id, ...stage };
    saveStages([...stages, newStage]);
  };

  const updateStage = (id: string, stage: Partial<Omit<StageOption, 'id'>>) => {
    saveStages(stages.map(s => s.id === id ? { ...s, ...stage } : s));
  };

  const deleteStage = (id: string) => {
    saveStages(stages.filter(s => s.id !== id));
  };

  const reorderStages = (newStages: StageOption[]) => {
    saveStages(newStages);
  };

  const addSubstage = (substage: Omit<SubstageOption, 'id'>) => {
    const id = substage.label.toLowerCase().replace(/\s+/g, '-');
    const newSubstage = { id, ...substage };
    saveSubstages([...substages, newSubstage]);
  };

  const updateSubstage = (id: string, substage: Omit<SubstageOption, 'id'>) => {
    saveSubstages(substages.map(s => s.id === id ? { ...s, ...substage } : s));
  };

  const deleteSubstage = (id: string) => {
    saveSubstages(substages.filter(s => s.id !== id));
  };

  const reorderSubstages = (newSubstages: SubstageOption[]) => {
    saveSubstages(newSubstages);
  };

  const addPassReason = (reason: Omit<PassReasonOption, 'id'>) => {
    const id = reason.label.toLowerCase().replace(/\s+/g, '-');
    const newReason = { id, ...reason };
    savePassReasons([...passReasons, newReason]);
  };

  const updatePassReason = (id: string, reason: Omit<PassReasonOption, 'id'>) => {
    savePassReasons(passReasons.map(r => r.id === id ? { ...r, ...reason } : r));
  };

  const deletePassReason = (id: string) => {
    savePassReasons(passReasons.filter(r => r.id !== id));
  };

  const reorderPassReasons = (newReasons: PassReasonOption[]) => {
    savePassReasons(newReasons);
  };

  const getStagesByGroup = (group: StageGroup) => {
    return stages.filter(s => s.group === group);
  };

  return (
    <LenderStagesContext.Provider value={{
      stages,
      addStage,
      updateStage,
      deleteStage,
      reorderStages,
      substages,
      addSubstage,
      updateSubstage,
      deleteSubstage,
      reorderSubstages,
      passReasons,
      addPassReason,
      updatePassReason,
      deletePassReason,
      reorderPassReasons,
      getStagesByGroup,
      isLoading,
      isSaving,
    }}>
      {children}
    </LenderStagesContext.Provider>
  );
}

export function useLenderStages() {
  const context = useContext(LenderStagesContext);
  if (!context) {
    throw new Error('useLenderStages must be used within a LenderStagesProvider');
  }
  return context;
}

import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback } from 'react';
import { STAGE_CONFIG } from '@/types/deal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DealStageOption {
  id: string;
  label: string;
  color: string;
}

interface DealStagesContextType {
  stages: DealStageOption[];
  defaultStageId: string | null;
  isLoadingDefault: boolean;
  addStage: (stage: Omit<DealStageOption, 'id'>) => void;
  updateStage: (id: string, stage: Partial<Omit<DealStageOption, 'id'>>) => void;
  deleteStage: (id: string) => void;
  reorderStages: (stages: DealStageOption[]) => void;
  setDefaultStageId: (id: string | null) => Promise<void>;
  getStageConfig: () => Record<string, { label: string; color: string }>;
}

const DealStagesContext = createContext<DealStagesContextType | undefined>(undefined);

// Convert STAGE_CONFIG to array format for default stages
const defaultStages: DealStageOption[] = Object.entries(STAGE_CONFIG).map(([id, config]) => ({
  id,
  label: config.label,
  color: config.color,
}));

export function DealStagesProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<DealStageOption[]>(() => {
    const saved = localStorage.getItem('dealStages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultStages;
      }
    }
    return defaultStages;
  });

  const [defaultStageId, setDefaultStageIdState] = useState<string | null>(() => {
    // Initial value from localStorage as fallback
    return localStorage.getItem('defaultDealStageId');
  });
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);

  // Fetch company ID and default stage from database
  useEffect(() => {
    const fetchCompanySettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoadingDefault(false);
          return;
        }

        // Get user's company
        const { data: membership } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership?.company_id) {
          setCompanyId(membership.company_id);

          // Get company settings
          const { data: settings } = await supabase
            .from('company_settings')
            .select('default_deal_stage_id')
            .eq('company_id', membership.company_id)
            .maybeSingle();

          if (settings?.default_deal_stage_id) {
            setDefaultStageIdState(settings.default_deal_stage_id);
          }
        }
      } catch (error) {
        console.error('Error fetching company settings:', error);
      } finally {
        setIsLoadingDefault(false);
      }
    };

    fetchCompanySettings();
  }, []);

  const saveStages = (newStages: DealStageOption[]) => {
    setStages(newStages);
    localStorage.setItem('dealStages', JSON.stringify(newStages));
  };

  const setDefaultStageId = useCallback(async (id: string | null) => {
    const previousId = defaultStageId;
    setDefaultStageIdState(id);

    // Always update localStorage as fallback
    if (id) {
      localStorage.setItem('defaultDealStageId', id);
    } else {
      localStorage.removeItem('defaultDealStageId');
    }

    // If user has a company, sync to database
    if (companyId) {
      try {
        // Check if settings exist
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('company_settings')
            .update({ default_deal_stage_id: id })
            .eq('company_id', companyId);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('company_settings')
            .insert({ company_id: companyId, default_deal_stage_id: id });

          if (error) throw error;
        }
      } catch (error) {
        console.error('Error saving default stage:', error);
        // Revert on error
        setDefaultStageIdState(previousId);
        toast.error('Failed to save default stage setting');
      }
    }
  }, [companyId, defaultStageId]);

  const addStage = (stage: Omit<DealStageOption, 'id'>) => {
    const id = stage.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newStage = { id, ...stage };
    saveStages([...stages, newStage]);
  };

  const updateStage = (id: string, stage: Partial<Omit<DealStageOption, 'id'>>) => {
    saveStages(stages.map(s => s.id === id ? { ...s, ...stage } : s));
  };

  const deleteStage = (id: string) => {
    // Clear default if deleting the default stage
    if (defaultStageId === id) {
      setDefaultStageId(null);
    }
    saveStages(stages.filter(s => s.id !== id));
  };

  const reorderStages = (newStages: DealStageOption[]) => {
    saveStages(newStages);
  };

  const getStageConfig = useMemo(() => {
    return () => {
      const config: Record<string, { label: string; color: string }> = {};
      stages.forEach(stage => {
        config[stage.id] = { label: stage.label, color: stage.color };
      });
      return config;
    };
  }, [stages]);

  return (
    <DealStagesContext.Provider value={{
      stages,
      defaultStageId,
      isLoadingDefault,
      addStage,
      updateStage,
      deleteStage,
      reorderStages,
      setDefaultStageId,
      getStageConfig,
    }}>
      {children}
    </DealStagesContext.Provider>
  );
}

export function useDealStages() {
  const context = useContext(DealStagesContext);
  if (!context) {
    throw new Error('useDealStages must be used within a DealStagesProvider');
  }
  return context;
}

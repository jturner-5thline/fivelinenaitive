import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { STAGE_CONFIG } from '@/types/deal';

export interface DealStageOption {
  id: string;
  label: string;
  color: string;
}

interface DealStagesContextType {
  stages: DealStageOption[];
  defaultStageId: string | null;
  addStage: (stage: Omit<DealStageOption, 'id'>) => void;
  updateStage: (id: string, stage: Partial<Omit<DealStageOption, 'id'>>) => void;
  deleteStage: (id: string) => void;
  reorderStages: (stages: DealStageOption[]) => void;
  setDefaultStageId: (id: string | null) => void;
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
    return localStorage.getItem('defaultDealStageId');
  });

  const saveStages = (newStages: DealStageOption[]) => {
    setStages(newStages);
    localStorage.setItem('dealStages', JSON.stringify(newStages));
  };

  const setDefaultStageId = (id: string | null) => {
    setDefaultStageIdState(id);
    if (id) {
      localStorage.setItem('defaultDealStageId', id);
    } else {
      localStorage.removeItem('defaultDealStageId');
    }
  };

  const addStage = (stage: Omit<DealStageOption, 'id'>) => {
    const id = stage.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newStage = { id, ...stage };
    saveStages([...stages, newStage]);
  };

  const updateStage = (id: string, stage: Partial<Omit<DealStageOption, 'id'>>) => {
    saveStages(stages.map(s => s.id === id ? { ...s, ...stage } : s));
  };

  const deleteStage = (id: string) => {
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

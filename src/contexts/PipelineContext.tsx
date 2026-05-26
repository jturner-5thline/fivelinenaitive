import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Pipeline, usePipelines } from '@/hooks/usePipelines';
import { DealStageOption } from '@/contexts/DealStagesContext';

interface PipelineContextType {
  pipelines: Pipeline[];
  activePipelineId: string | null;
  activePipeline: Pipeline | null;
  isLoading: boolean;
  companyId: string | null;
  setActivePipelineId: (id: string | null) => void;
  createPipeline: (name: string, stages: DealStageOption[], isDefault?: boolean) => Promise<Pipeline | null>;
  updatePipeline: (id: string, updates: { name?: string; stages?: DealStageOption[]; isDefault?: boolean }) => Promise<void>;
  deletePipeline: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const PipelineContext = createContext<PipelineContextType | undefined>(undefined);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const { pipelines, isLoading, companyId, createPipeline, updatePipeline, deletePipeline, refetch } = usePipelines();
  
  const [activePipelineId, setActivePipelineIdState] = useState<string | null>(null);

  // Always select the default pipeline when pipelines load
  useEffect(() => {
    if (pipelines.length > 0) {
      const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0];
      setActivePipelineIdState(defaultPipeline.id);
    }
  }, [pipelines]);

  // Listen for tenant deal-pipeline updates triggered from Settings and refetch
  useEffect(() => {
    const handler = () => { refetch(); };
    window.addEventListener('deal-pipelines-updated', handler);
    return () => window.removeEventListener('deal-pipelines-updated', handler);
  }, [refetch]);

  const setActivePipelineId = useCallback((id: string | null) => {
    setActivePipelineIdState(id);
  }, []);

  const activePipeline = pipelines.find(p => p.id === activePipelineId) || null;

  return (
    <PipelineContext.Provider value={{
      pipelines,
      activePipelineId,
      activePipeline,
      isLoading,
      companyId,
      setActivePipelineId,
      createPipeline,
      updatePipeline,
      deletePipeline,
      refetch,
    }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipelineContext() {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error('usePipelineContext must be used within a PipelineProvider');
  }
  return context;
}

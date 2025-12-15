import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface SubstageOption {
  id: string;
  label: string;
}

export interface StageOption {
  id: string;
  label: string;
  substages: SubstageOption[];
}

interface LenderStagesContextType {
  stages: StageOption[];
  addStage: (stage: Omit<StageOption, 'id' | 'substages'>) => void;
  updateStage: (id: string, stage: Omit<StageOption, 'id' | 'substages'>) => void;
  deleteStage: (id: string) => void;
  reorderStages: (stages: StageOption[]) => void;
  addSubstage: (stageId: string, substage: Omit<SubstageOption, 'id'>) => void;
  updateSubstage: (stageId: string, substageId: string, substage: Omit<SubstageOption, 'id'>) => void;
  deleteSubstage: (stageId: string, substageId: string) => void;
  reorderSubstages: (stageId: string, substages: SubstageOption[]) => void;
}

const LenderStagesContext = createContext<LenderStagesContextType | undefined>(undefined);

const defaultStages: StageOption[] = [
  { id: 'reviewing-drl', label: 'Reviewing DRL', substages: [] },
  { id: 'management-call-set', label: 'Management Call Set', substages: [] },
  { id: 'management-call-completed', label: 'Management Call Completed', substages: [] },
  { id: 'draft-terms', label: 'Draft Terms', substages: [] },
  { id: 'term-sheets', label: 'Term Sheets', substages: [] },
];

export function LenderStagesProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<StageOption[]>(() => {
    const saved = localStorage.getItem('lenderStages');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old format without substages
      return parsed.map((s: StageOption) => ({
        ...s,
        substages: s.substages || [],
      }));
    }
    return defaultStages;
  });

  const saveStages = (newStages: StageOption[]) => {
    setStages(newStages);
    localStorage.setItem('lenderStages', JSON.stringify(newStages));
  };

  const addStage = (stage: Omit<StageOption, 'id' | 'substages'>) => {
    const id = stage.label.toLowerCase().replace(/\s+/g, '-');
    const newStage: StageOption = { id, ...stage, substages: [] };
    saveStages([...stages, newStage]);
  };

  const updateStage = (id: string, stage: Omit<StageOption, 'id' | 'substages'>) => {
    saveStages(stages.map(s => s.id === id ? { ...s, ...stage } : s));
  };

  const deleteStage = (id: string) => {
    saveStages(stages.filter(s => s.id !== id));
  };

  const reorderStages = (newStages: StageOption[]) => {
    saveStages(newStages);
  };

  const addSubstage = (stageId: string, substage: Omit<SubstageOption, 'id'>) => {
    const id = `${stageId}-${substage.label.toLowerCase().replace(/\s+/g, '-')}`;
    saveStages(stages.map(s => 
      s.id === stageId 
        ? { ...s, substages: [...s.substages, { id, ...substage }] }
        : s
    ));
  };

  const updateSubstage = (stageId: string, substageId: string, substage: Omit<SubstageOption, 'id'>) => {
    saveStages(stages.map(s => 
      s.id === stageId 
        ? { ...s, substages: s.substages.map(sub => sub.id === substageId ? { ...sub, ...substage } : sub) }
        : s
    ));
  };

  const deleteSubstage = (stageId: string, substageId: string) => {
    saveStages(stages.map(s => 
      s.id === stageId 
        ? { ...s, substages: s.substages.filter(sub => sub.id !== substageId) }
        : s
    ));
  };

  const reorderSubstages = (stageId: string, substages: SubstageOption[]) => {
    saveStages(stages.map(s => 
      s.id === stageId ? { ...s, substages } : s
    ));
  };

  return (
    <LenderStagesContext.Provider value={{ 
      stages, 
      addStage, 
      updateStage, 
      deleteStage, 
      reorderStages,
      addSubstage,
      updateSubstage,
      deleteSubstage,
      reorderSubstages,
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

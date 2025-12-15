import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface StageOption {
  id: string;
  label: string;
}

interface LenderStagesContextType {
  stages: StageOption[];
  addStage: (stage: Omit<StageOption, 'id'>) => void;
  updateStage: (id: string, stage: Omit<StageOption, 'id'>) => void;
  deleteStage: (id: string) => void;
  reorderStages: (stages: StageOption[]) => void;
}

const LenderStagesContext = createContext<LenderStagesContextType | undefined>(undefined);

const defaultStages: StageOption[] = [
  { id: 'reviewing-drl', label: 'Reviewing DRL' },
  { id: 'management-call-set', label: 'Management Call Set' },
  { id: 'management-call-completed', label: 'Management Call Completed' },
  { id: 'draft-terms', label: 'Draft Terms' },
  { id: 'term-sheets', label: 'Term Sheets' },
];

export function LenderStagesProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<StageOption[]>(() => {
    const saved = localStorage.getItem('lenderStages');
    return saved ? JSON.parse(saved) : defaultStages;
  });

  const saveStages = (newStages: StageOption[]) => {
    setStages(newStages);
    localStorage.setItem('lenderStages', JSON.stringify(newStages));
  };

  const addStage = (stage: Omit<StageOption, 'id'>) => {
    const id = stage.label.toLowerCase().replace(/\s+/g, '-');
    const newStage = { id, ...stage };
    saveStages([...stages, newStage]);
  };

  const updateStage = (id: string, stage: Omit<StageOption, 'id'>) => {
    saveStages(stages.map(s => s.id === id ? { ...s, ...stage } : s));
  };

  const deleteStage = (id: string) => {
    saveStages(stages.filter(s => s.id !== id));
  };

  const reorderStages = (newStages: StageOption[]) => {
    saveStages(newStages);
  };

  return (
    <LenderStagesContext.Provider value={{ stages, addStage, updateStage, deleteStage, reorderStages }}>
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

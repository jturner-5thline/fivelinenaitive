import React, { createContext, useContext, useState, ReactNode } from 'react';

export type StageGroup = 'active' | 'on-deck' | 'passed' | 'on-hold';

export const STAGE_GROUPS: { id: StageGroup; label: string; color: string }[] = [
  { id: 'active', label: 'Active', color: 'bg-green-500' },
  { id: 'on-deck', label: 'On Deck', color: 'bg-blue-500' },
  { id: 'passed', label: 'Passed', color: 'bg-red-500' },
  { id: 'on-hold', label: 'On Hold', color: 'bg-yellow-500' },
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
}

const LenderStagesContext = createContext<LenderStagesContextType | undefined>(undefined);

const defaultStages: StageOption[] = [
  { id: 'reviewing-drl', label: 'Reviewing DRL', group: 'active' },
  { id: 'management-call-set', label: 'Management Call Set', group: 'active' },
  { id: 'management-call-completed', label: 'Management Call Completed', group: 'active' },
  { id: 'draft-terms', label: 'Draft Terms', group: 'active' },
  { id: 'term-sheets', label: 'Term Sheets', group: 'active' },
];

const defaultSubstages: SubstageOption[] = [
  { id: 'awaiting-response', label: 'Awaiting Response' },
  { id: 'in-review', label: 'In Review' },
  { id: 'follow-up-needed', label: 'Follow-up Needed' },
  { id: 'scheduled', label: 'Scheduled' },
];

const defaultPassReasons: PassReasonOption[] = [
  { id: 'too-small', label: 'Too Small' },
  { id: 'business-model', label: 'Business Model' },
  { id: 'burn-too-high', label: 'Burn Too High' },
];

export function LenderStagesProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<StageOption[]>(() => {
    const saved = localStorage.getItem('lenderStages');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old stages without group
      return parsed.map((s: any) => ({
        ...s,
        group: s.group || 'active'
      }));
    }
    return defaultStages;
  });

  const [substages, setSubstages] = useState<SubstageOption[]>(() => {
    const saved = localStorage.getItem('lenderSubstages');
    return saved ? JSON.parse(saved) : defaultSubstages;
  });

  const [passReasons, setPassReasons] = useState<PassReasonOption[]>(() => {
    const saved = localStorage.getItem('lenderPassReasons');
    return saved ? JSON.parse(saved) : defaultPassReasons;
  });

  const saveStages = (newStages: StageOption[]) => {
    setStages(newStages);
    localStorage.setItem('lenderStages', JSON.stringify(newStages));
  };

  const saveSubstages = (newSubstages: SubstageOption[]) => {
    setSubstages(newSubstages);
    localStorage.setItem('lenderSubstages', JSON.stringify(newSubstages));
  };

  const savePassReasons = (newReasons: PassReasonOption[]) => {
    setPassReasons(newReasons);
    localStorage.setItem('lenderPassReasons', JSON.stringify(newReasons));
  };

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

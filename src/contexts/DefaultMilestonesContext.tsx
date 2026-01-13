import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type MilestoneTimingType = 'from_creation' | 'after_previous';

export interface DefaultMilestone {
  id: string;
  title: string;
  daysFromCreation: number;
  timingType: MilestoneTimingType;
  position: number;
}

interface DefaultMilestonesContextType {
  defaultMilestones: DefaultMilestone[];
  addDefaultMilestone: (milestone: Omit<DefaultMilestone, 'id' | 'position'>) => void;
  updateDefaultMilestone: (id: string, updates: Partial<Omit<DefaultMilestone, 'id'>>) => void;
  deleteDefaultMilestone: (id: string) => void;
  reorderDefaultMilestones: (milestones: DefaultMilestone[]) => void;
}

const DefaultMilestonesContext = createContext<DefaultMilestonesContextType | undefined>(undefined);

const STORAGE_KEY = 'default-deal-milestones';

const DEFAULT_MILESTONES: DefaultMilestone[] = [
  { id: 'kick-off', title: 'Kick-off Call', daysFromCreation: 3, timingType: 'from_creation', position: 0 },
  { id: 'due-diligence', title: 'Due Diligence Complete', daysFromCreation: 14, timingType: 'from_creation', position: 1 },
  { id: 'term-sheet', title: 'Term Sheet Received', daysFromCreation: 30, timingType: 'from_creation', position: 2 },
];

export function DefaultMilestonesProvider({ children }: { children: ReactNode }) {
  const [defaultMilestones, setDefaultMilestones] = useState<DefaultMilestone[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate old milestones without timingType
        return parsed.map((m: any) => ({
          ...m,
          timingType: m.timingType || 'from_creation'
        }));
      }
    } catch (error) {
      console.error('Failed to load default milestones:', error);
    }
    return DEFAULT_MILESTONES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultMilestones));
    } catch (error) {
      console.error('Failed to save default milestones:', error);
    }
  }, [defaultMilestones]);

  const addDefaultMilestone = (milestone: Omit<DefaultMilestone, 'id' | 'position'>) => {
    const newId = `milestone-${Date.now()}`;
    const maxPosition = Math.max(...defaultMilestones.map(m => m.position), -1);
    setDefaultMilestones(prev => [
      ...prev,
      { ...milestone, id: newId, position: maxPosition + 1, timingType: milestone.timingType || 'from_creation' }
    ]);
  };

  const updateDefaultMilestone = (id: string, updates: Partial<Omit<DefaultMilestone, 'id'>>) => {
    setDefaultMilestones(prev =>
      prev.map(m => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const deleteDefaultMilestone = (id: string) => {
    setDefaultMilestones(prev => prev.filter(m => m.id !== id));
  };

  const reorderDefaultMilestones = (milestones: DefaultMilestone[]) => {
    setDefaultMilestones(milestones.map((m, index) => ({ ...m, position: index })));
  };

  return (
    <DefaultMilestonesContext.Provider
      value={{
        defaultMilestones,
        addDefaultMilestone,
        updateDefaultMilestone,
        deleteDefaultMilestone,
        reorderDefaultMilestones,
      }}
    >
      {children}
    </DefaultMilestonesContext.Provider>
  );
}

export function useDefaultMilestones() {
  const context = useContext(DefaultMilestonesContext);
  if (!context) {
    throw new Error('useDefaultMilestones must be used within a DefaultMilestonesProvider');
  }
  return context;
}

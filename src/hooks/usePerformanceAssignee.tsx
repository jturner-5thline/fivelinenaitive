import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export const PERFORMANCE_ASSIGNEES = ['Niki Heikali', 'James Turner'] as const;
export type PerformanceAssigneeName = typeof PERFORMANCE_ASSIGNEES[number];

interface PerformanceAssigneeContextValue {
  /**
   * Legacy single-assignee value. Kept for header text and any consumer that
   * only needs a display label. Equals the first selected name when one or
   * more are chosen; falls back to 'Niki Heikali' (default) when the whole
   * team is selected (empty selection).
   */
  assignee: PerformanceAssigneeName;
  setAssignee: (name: PerformanceAssigneeName) => void;
  /**
   * Multi-select. Empty array = "whole team" (no name filter). Non-empty =
   * filter to deals owned/managed by any of the selected names.
   */
  selected: PerformanceAssigneeName[];
  toggleSelected: (name: PerformanceAssigneeName) => void;
  clearSelected: () => void;
  isTeamView: boolean;
}

const Ctx = createContext<PerformanceAssigneeContextValue | null>(null);

export function PerformanceAssigneeProvider({
  children,
  initial = 'Niki Heikali',
}: { children: ReactNode; initial?: PerformanceAssigneeName }) {
  const [selected, setSelected] = useState<PerformanceAssigneeName[]>([initial]);

  const value = useMemo<PerformanceAssigneeContextValue>(() => {
    const assignee: PerformanceAssigneeName = selected[0] ?? 'Niki Heikali';
    return {
      assignee,
      setAssignee: (name) => setSelected([name]),
      selected,
      toggleSelected: (name) =>
        setSelected((prev) =>
          prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
        ),
      clearSelected: () => setSelected([]),
      isTeamView: selected.length === 0,
    };
  }, [selected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Returns the currently-selected performance assignee (defaults to Niki). */
export function usePerformanceAssignee(): PerformanceAssigneeContextValue {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    assignee: 'Niki Heikali',
    setAssignee: () => {},
    selected: ['Niki Heikali'],
    toggleSelected: () => {},
    clearSelected: () => {},
    isTeamView: false,
  };
}

import { createContext, useContext, useState, type ReactNode } from 'react';

export const PERFORMANCE_ASSIGNEES = ['Niki Heikali', 'James Turner'] as const;
export type PerformanceAssigneeName = typeof PERFORMANCE_ASSIGNEES[number];

interface PerformanceAssigneeContextValue {
  assignee: PerformanceAssigneeName;
  setAssignee: (name: PerformanceAssigneeName) => void;
}

const Ctx = createContext<PerformanceAssigneeContextValue | null>(null);

export function PerformanceAssigneeProvider({
  children,
  initial = 'Niki Heikali',
}: { children: ReactNode; initial?: PerformanceAssigneeName }) {
  const [assignee, setAssignee] = useState<PerformanceAssigneeName>(initial);
  return <Ctx.Provider value={{ assignee, setAssignee }}>{children}</Ctx.Provider>;
}

/** Returns the currently-selected performance assignee (defaults to Niki). */
export function usePerformanceAssignee(): PerformanceAssigneeContextValue {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return { assignee: 'Niki Heikali', setAssignee: () => {} };
}

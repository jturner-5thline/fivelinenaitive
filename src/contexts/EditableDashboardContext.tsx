import { createContext, useContext, ReactNode } from 'react';

interface EditableDashboardContextValue {
  isEditMode: boolean;
  onCardEdit?: (cardTitle: string) => void;
}

const EditableDashboardContext = createContext<EditableDashboardContextValue>({
  isEditMode: false,
});

export function EditableDashboardProvider({
  isEditMode,
  onCardEdit,
  children,
}: EditableDashboardContextValue & { children: ReactNode }) {
  return (
    <EditableDashboardContext.Provider value={{ isEditMode, onCardEdit }}>
      {children}
    </EditableDashboardContext.Provider>
  );
}

export function useEditableDashboard() {
  return useContext(EditableDashboardContext);
}

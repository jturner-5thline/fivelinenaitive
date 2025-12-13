import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Preferences {
  compactMode: boolean;
  emailNotifications: boolean;
  dealStatusAlerts: boolean;
  currency: 'usd' | 'eur' | 'gbp';
  dateFormat: 'mdy' | 'dmy' | 'ymd';
}

const DEFAULT_PREFERENCES: Preferences = {
  compactMode: false,
  emailNotifications: true,
  dealStatusAlerts: true,
  currency: 'usd',
  dateFormat: 'mdy',
};

const STORAGE_KEY = 'user-preferences';

const loadPreferences = (): Preferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load preferences from localStorage:', error);
  }
  return DEFAULT_PREFERENCES;
};

const savePreferences = (preferences: Preferences) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save preferences to localStorage:', error);
  }
};

interface PreferencesContextType {
  preferences: Preferences;
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const updatePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreference }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}

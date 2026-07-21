import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type CurrencyFormat = 'abbreviated' | 'abbreviated-1' | 'abbreviated-2' | 'full';

export type SuggestionType = 'warning' | 'action' | 'opportunity' | 'reminder';

export interface SuggestionPreferences {
  staleLenders: boolean;
  overdueMilestones: boolean;
  upcomingMilestones: boolean;
  lendersWithoutNotes: boolean;
  stuckLenders: boolean;
  staleDeals: boolean;
  termSheetOpportunities: boolean;
  noMilestones: boolean;
  allMilestonesComplete: boolean;
}

export interface Preferences {
  currencyFormat: CurrencyFormat;
  lenderUpdateYellowDays: number;
  lenderUpdateRedDays: number;
  staleDealsDays: number;
  defaultLenderStage: string;
  suggestions: SuggestionPreferences;
}

export const CURRENCY_FORMAT_OPTIONS: { value: CurrencyFormat; label: string; example: string }[] = [
  { value: 'abbreviated', label: 'Abbreviated', example: '$15MM' },
  { value: 'abbreviated-1', label: 'One Decimal', example: '$15.0MM' },
  { value: 'abbreviated-2', label: 'Two Decimals', example: '$15.00MM' },
  { value: 'full', label: 'Full Number', example: '$15,000,000' },
];

export const DEFAULT_SUGGESTION_PREFERENCES: SuggestionPreferences = {
  staleLenders: true,
  overdueMilestones: true,
  upcomingMilestones: true,
  lendersWithoutNotes: true,
  stuckLenders: true,
  staleDeals: true,
  termSheetOpportunities: true,
  noMilestones: true,
  allMilestonesComplete: true,
};

const DEFAULT_PREFERENCES: Preferences = {
  currencyFormat: 'abbreviated-2',
  lenderUpdateYellowDays: 7,
  lenderUpdateRedDays: 14,
  staleDealsDays: 14,
  defaultLenderStage: 'on-deck',
  suggestions: DEFAULT_SUGGESTION_PREFERENCES,
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

export const formatCurrency = (value: number, preferences: Preferences): string => {
  const symbol = '$';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (preferences.currencyFormat === 'full') {
    return `${sign}${symbol}${abs.toLocaleString()}`;
  }
  
  const billions = abs / 1_000_000_000;
  const millions = abs / 1_000_000;
  const thousands = abs / 1_000;
  
  if (abs >= 1_000_000_000) {
    switch (preferences.currencyFormat) {
      case 'abbreviated':
        return `${sign}${symbol}${Math.round(billions)}B`;
      case 'abbreviated-1':
        return `${sign}${symbol}${billions.toFixed(1)}B`;
      case 'abbreviated-2':
        return `${sign}${symbol}${billions.toFixed(2)}B`;
      default:
        return `${sign}${symbol}${billions.toFixed(1)}B`;
    }
  } else if (abs >= 1_000_000) {
    switch (preferences.currencyFormat) {
      case 'abbreviated':
        return `${sign}${symbol}${Math.round(millions)}MM`;
      case 'abbreviated-1':
        return `${sign}${symbol}${millions.toFixed(1)}MM`;
      case 'abbreviated-2':
        return `${sign}${symbol}${millions.toFixed(2)}MM`;
      default:
        return `${sign}${symbol}${millions.toFixed(1)}MM`;
    }
  } else if (abs >= 1_000) {
    switch (preferences.currencyFormat) {
      case 'abbreviated':
        return `${sign}${symbol}${Math.round(thousands)}K`;
      case 'abbreviated-1':
        return `${sign}${symbol}${thousands.toFixed(1)}K`;
      case 'abbreviated-2':
        return `${sign}${symbol}${thousands.toFixed(2)}K`;
      default:
        return `${sign}${symbol}${thousands.toFixed(1)}K`;
    }
  }
  
  return `${sign}${symbol}${abs.toLocaleString()}`;
};

interface PreferencesContextType {
  preferences: Preferences;
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  formatCurrencyValue: (value: number) => string;
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

  const formatCurrencyValue = (value: number) => formatCurrency(value, preferences);

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreference, formatCurrencyValue }}>
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

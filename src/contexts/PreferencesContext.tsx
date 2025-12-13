import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type CurrencyFormat = 'abbreviated' | 'abbreviated-1' | 'abbreviated-2' | 'full';

export interface Preferences {
  compactMode: boolean;
  emailNotifications: boolean;
  dealStatusAlerts: boolean;
  currency: 'usd' | 'eur' | 'gbp';
  currencyFormat: CurrencyFormat;
  dateFormat: 'mdy' | 'dmy' | 'ymd';
}

export const CURRENCY_FORMAT_OPTIONS: { value: CurrencyFormat; label: string; example: string }[] = [
  { value: 'abbreviated', label: 'Abbreviated', example: '$15MM' },
  { value: 'abbreviated-1', label: 'One Decimal', example: '$15.0MM' },
  { value: 'abbreviated-2', label: 'Two Decimals', example: '$15.00MM' },
  { value: 'full', label: 'Full Number', example: '$15,000,000' },
];

const DEFAULT_PREFERENCES: Preferences = {
  compactMode: false,
  emailNotifications: true,
  dealStatusAlerts: true,
  currency: 'usd',
  currencyFormat: 'abbreviated-1',
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

const CURRENCY_SYMBOLS: Record<Preferences['currency'], string> = {
  usd: '$',
  eur: '€',
  gbp: '£',
};

export const formatCurrency = (value: number, preferences: Preferences): string => {
  const symbol = CURRENCY_SYMBOLS[preferences.currency];
  
  if (preferences.currencyFormat === 'full') {
    return `${symbol}${value.toLocaleString()}`;
  }
  
  const millions = value / 1000000;
  const thousands = value / 1000;
  
  if (value >= 1000000) {
    switch (preferences.currencyFormat) {
      case 'abbreviated':
        return `${symbol}${Math.round(millions)}MM`;
      case 'abbreviated-1':
        return `${symbol}${millions.toFixed(1)}MM`;
      case 'abbreviated-2':
        return `${symbol}${millions.toFixed(2)}MM`;
      default:
        return `${symbol}${millions.toFixed(1)}MM`;
    }
  } else if (value >= 1000) {
    switch (preferences.currencyFormat) {
      case 'abbreviated':
        return `${symbol}${Math.round(thousands)}K`;
      case 'abbreviated-1':
        return `${symbol}${thousands.toFixed(1)}K`;
      case 'abbreviated-2':
        return `${symbol}${thousands.toFixed(2)}K`;
      default:
        return `${symbol}${value.toLocaleString()}`;
    }
  }
  
  return `${symbol}${value.toLocaleString()}`;
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

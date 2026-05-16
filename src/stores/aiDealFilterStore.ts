import { create } from 'zustand';
import type { DealFilterRule } from '@/lib/dealFilterEngine';

interface AiDealFilterState {
  rules: DealFilterRule[];
  matchMode: 'all' | 'any';
  summary: string | null;
  lastClarification: string | null;
  isTranslating: boolean;
  setRules: (rules: DealFilterRule[], summary?: string | null, matchMode?: 'all' | 'any') => void;
  addRules: (rules: DealFilterRule[], summary?: string | null) => void;
  removeRule: (id: string) => void;
  clear: () => void;
  setClarification: (msg: string | null) => void;
  setTranslating: (v: boolean) => void;
}

export const useAiDealFilterStore = create<AiDealFilterState>((set) => ({
  rules: [],
  matchMode: 'all',
  summary: null,
  lastClarification: null,
  isTranslating: false,
  setRules: (rules, summary = null, matchMode = 'all') =>
    set({ rules, summary, matchMode, lastClarification: null }),
  addRules: (rules, summary = null) =>
    set((s) => ({
      rules: [...s.rules, ...rules],
      summary: summary ?? s.summary,
      lastClarification: null,
    })),
  removeRule: (id) =>
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  clear: () => set({ rules: [], summary: null, lastClarification: null, matchMode: 'all' }),
  setClarification: (msg) => set({ lastClarification: msg }),
  setTranslating: (v) => set({ isTranslating: v }),
}));
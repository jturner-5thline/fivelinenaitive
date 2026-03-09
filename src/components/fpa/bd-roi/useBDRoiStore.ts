import { create } from 'zustand';
import {
  INITIAL_REVENUE, INITIAL_COSTS, INITIAL_HEADCOUNT, INITIAL_CM_BONUS,
  INITIAL_DEALFLOW, INITIAL_FIN_PERF, INITIAL_PARTNER_ASSUMPTIONS, INITIAL_PARTNER_DATA,
  INITIAL_BANK_ASSUMPTIONS, INITIAL_BANK_DATA, INITIAL_EVENTS, INITIAL_AMEX,
  type BDEvent, type AmexTransaction,
} from './bdRoiData';

export interface AuditEntry {
  id: string; timestamp: string; user: string;
  field: string; quarter: string; tab: string;
  oldValue: number; newValue: number;
}

export interface BDComment {
  id: string; text: string; author: string; timestamp: string; completed: boolean;
}

interface BDRoiState {
  revenue: typeof INITIAL_REVENUE;
  costs: typeof INITIAL_COSTS;
  headcount: typeof INITIAL_HEADCOUNT;
  cmBonus: number[];
  dealflow: typeof INITIAL_DEALFLOW;
  finPerf: typeof INITIAL_FIN_PERF;
  partnerAssumptions: typeof INITIAL_PARTNER_ASSUMPTIONS;
  partnerProjections: typeof INITIAL_PARTNER_DATA;
  partnerActuals: typeof INITIAL_PARTNER_DATA;
  bankAssumptions: typeof INITIAL_BANK_ASSUMPTIONS;
  bankProjections: typeof INITIAL_BANK_DATA;
  bankActuals: typeof INITIAL_BANK_DATA;
  events: BDEvent[];
  amex: AmexTransaction[];
  auditLog: AuditEntry[];
  comments: BDComment[];
  userName: string;

  updateNestedArray: (category: string, key: string, index: number, value: number, quarter: string, tab: string) => void;
  updateFlatArray: (category: string, index: number, value: number, quarter: string, tab: string) => void;
  updatePartnerExpense: (type: 'partnerProjections' | 'partnerActuals', expIdx: number, qIdx: number, value: number, quarter: string) => void;
  updateBankExpense: (type: 'bankProjections' | 'bankActuals', key: string, qIdx: number, value: number, quarter: string) => void;
  updateEvent: (idx: number, field: keyof BDEvent, value: any) => void;
  updateAmex: (idx: number, field: keyof AmexTransaction, value: any) => void;
  updateAssumption: (channel: 'partnerAssumptions' | 'bankAssumptions', key: string, value: number) => void;
  addComment: (text: string) => void;
  toggleComment: (id: string) => void;
  clearAuditLog: () => void;
  setUserName: (name: string) => void;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const useBDRoiStore = create<BDRoiState>((set, get) => ({
  revenue: deepClone(INITIAL_REVENUE),
  costs: deepClone(INITIAL_COSTS),
  headcount: deepClone(INITIAL_HEADCOUNT),
  cmBonus: [...INITIAL_CM_BONUS],
  dealflow: deepClone(INITIAL_DEALFLOW),
  finPerf: deepClone(INITIAL_FIN_PERF),
  partnerAssumptions: { ...INITIAL_PARTNER_ASSUMPTIONS },
  partnerProjections: deepClone(INITIAL_PARTNER_DATA),
  partnerActuals: deepClone(INITIAL_PARTNER_DATA),
  bankAssumptions: { ...INITIAL_BANK_ASSUMPTIONS },
  bankProjections: deepClone(INITIAL_BANK_DATA),
  bankActuals: deepClone(INITIAL_BANK_DATA),
  events: deepClone(INITIAL_EVENTS),
  amex: deepClone(INITIAL_AMEX),
  auditLog: [],
  comments: [],
  userName: 'User',

  updateNestedArray: (category, key, index, value, quarter, tab) => {
    const state = get();
    const catData = deepClone((state as any)[category]);
    const oldValue = catData[key][index];
    catData[key][index] = value;
    const entry: AuditEntry = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      user: state.userName, field: `${category}.${key}`, quarter, tab, oldValue, newValue: value,
    };
    set({ [category]: catData, auditLog: [entry, ...state.auditLog] } as any);
  },

  updateFlatArray: (category, index, value, quarter, tab) => {
    const state = get();
    const arr = [...(state as any)[category]];
    const oldValue = arr[index];
    arr[index] = value;
    const entry: AuditEntry = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      user: state.userName, field: category, quarter, tab, oldValue, newValue: value,
    };
    set({ [category]: arr, auditLog: [entry, ...state.auditLog] } as any);
  },

  updatePartnerExpense: (type, expIdx, qIdx, value, quarter) => {
    const state = get();
    const data = deepClone((state as any)[type]);
    const oldValue = data.expenses[expIdx][qIdx];
    data.expenses[expIdx][qIdx] = value;
    const entry: AuditEntry = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      user: state.userName, field: `${type}.expenses[${expIdx}]`, quarter, tab: 'Partner', oldValue, newValue: value,
    };
    set({ [type]: data, auditLog: [entry, ...state.auditLog] } as any);
  },

  updateBankExpense: (type, key, qIdx, value, quarter) => {
    const state = get();
    const data = deepClone((state as any)[type]);
    const oldValue = data.expenses[key][qIdx];
    data.expenses[key][qIdx] = value;
    const entry: AuditEntry = {
      id: crypto.randomUUID(), timestamp: new Date().toISOString(),
      user: state.userName, field: `${type}.expenses.${key}`, quarter, tab: 'Bank', oldValue, newValue: value,
    };
    set({ [type]: data, auditLog: [entry, ...state.auditLog] } as any);
  },

  updateEvent: (idx, field, value) => {
    const events = deepClone(get().events);
    (events[idx] as any)[field] = value;
    set({ events });
  },

  updateAmex: (idx, field, value) => {
    const amex = deepClone(get().amex);
    (amex[idx] as any)[field] = value;
    set({ amex });
  },

  updateAssumption: (channel, key, value) => {
    const data = { ...(get() as any)[channel], [key]: value };
    set({ [channel]: data } as any);
  },

  addComment: (text) => {
    const state = get();
    const comment: BDComment = {
      id: crypto.randomUUID(), text, author: state.userName,
      timestamp: new Date().toISOString(), completed: false,
    };
    set({ comments: [...state.comments, comment] });
  },

  toggleComment: (id) => {
    set({ comments: get().comments.map(c => c.id === id ? { ...c, completed: !c.completed } : c) });
  },

  clearAuditLog: () => set({ auditLog: [] }),
  setUserName: (name) => set({ userName: name }),
}));

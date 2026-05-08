import { create } from 'zustand';
import type { ConversationMutation } from '@/lib/copilot-utils';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  metadata?: Record<string, any>;
}

interface CopilotStore {
  isOpen: boolean;
  isMinimized: boolean;
  unreadCount: number;
  messages: CopilotMessage[];
  isProcessing: boolean;
  conversationId: string | null;
  conversationMutations: ConversationMutation[];
  pendingPrompt: string | null;
  /**
   * Onboarding-only sandboxed demo. When true, the copilot panel renders a
   * static, fully fake conversation and disables the live input. NO real
   * workspace data is queried, displayed, or written while this is true.
   */
  demoMode: boolean;
  /** The text shown (animated) inside the live Ask bar during the demo. */
  demoTypedPrompt: string;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  minimizePanel: () => void;
  expandPanel: () => void;
  addMessage: (message: CopilotMessage) => void;
  setMessages: (messages: CopilotMessage[]) => void;
  setProcessing: (processing: boolean) => void;
  clearMessages: () => void;
  setConversationId: (id: string | null) => void;
  addMutation: (mutation: ConversationMutation) => void;
  setPendingPrompt: (prompt: string | null) => void;
  openPanelWithPrompt: (prompt: string) => void;
  startDemo: () => void;
  stopDemo: () => void;
  setDemoTypedPrompt: (text: string) => void;
}

export const useCopilotStore = create<CopilotStore>((set) => ({
  isOpen: false,
  isMinimized: false,
  unreadCount: 0,
  messages: [],
  isProcessing: false,
  conversationId: null,
  conversationMutations: [],
  pendingPrompt: null,
  demoMode: false,
  demoTypedPrompt: '',
  // togglePanel cycles: closed → open, open → minimized, minimized → open.
  togglePanel: () => set((s) => {
    if (!s.isOpen) return { isOpen: true, isMinimized: false, unreadCount: 0 };
    if (s.isMinimized) return { isMinimized: false, unreadCount: 0 };
    return { isMinimized: true };
  }),
  openPanel: () => set({ isOpen: true, isMinimized: false, unreadCount: 0 }),
  closePanel: () => set({ isOpen: false, isMinimized: false, unreadCount: 0, messages: [], conversationId: null, conversationMutations: [] }),
  minimizePanel: () => set({ isMinimized: true }),
  expandPanel: () => set({ isOpen: true, isMinimized: false, unreadCount: 0 }),
  addMessage: (message) => set((s) => ({
    messages: [...s.messages, message],
    unreadCount: s.isMinimized && message.role === 'assistant' ? s.unreadCount + 1 : s.unreadCount,
  })),
  setMessages: (messages) => set({ messages }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  clearMessages: () => set({ messages: [], conversationId: null, conversationMutations: [], unreadCount: 0 }),
  setConversationId: (id) => set({ conversationId: id }),
  addMutation: (mutation) => set((s) => ({ conversationMutations: [...s.conversationMutations, mutation] })),
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
  // Submitting from the Ask bar should NOT auto-expand a minimized panel —
  // the request keeps running, and the unread indicator on the bar nudges
  // the user. If the panel was fully closed, opening for the first time
  // does expand so the user sees their message.
  openPanelWithPrompt: (prompt) => set((s) => ({
    isOpen: true,
    isMinimized: s.isOpen ? s.isMinimized : false,
    pendingPrompt: prompt,
  })),
  startDemo: () => set({
    demoMode: true,
    isOpen: true,
    isMinimized: false,
    messages: [],
    isProcessing: false,
    demoTypedPrompt: '',
    unreadCount: 0,
  }),
  stopDemo: () => set({ demoMode: false, demoTypedPrompt: '' }),
  setDemoTypedPrompt: (text) => set({ demoTypedPrompt: text }),
}));

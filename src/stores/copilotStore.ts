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
  messages: CopilotMessage[];
  isProcessing: boolean;
  conversationId: string | null;
  conversationMutations: ConversationMutation[];
  pendingPrompt: string | null;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  addMessage: (message: CopilotMessage) => void;
  setMessages: (messages: CopilotMessage[]) => void;
  setProcessing: (processing: boolean) => void;
  clearMessages: () => void;
  setConversationId: (id: string | null) => void;
  addMutation: (mutation: ConversationMutation) => void;
  setPendingPrompt: (prompt: string | null) => void;
  openPanelWithPrompt: (prompt: string) => void;
}

export const useCopilotStore = create<CopilotStore>((set) => ({
  isOpen: false,
  messages: [],
  isProcessing: false,
  conversationId: null,
  conversationMutations: [],
  pendingPrompt: null,
  togglePanel: () => set((s) => {
    console.log('[Copilot] togglePanel →', !s.isOpen);
    return { isOpen: !s.isOpen };
  }),
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  clearMessages: () => set({ messages: [], conversationId: null, conversationMutations: [] }),
  setConversationId: (id) => set({ conversationId: id }),
  addMutation: (mutation) => set((s) => ({ conversationMutations: [...s.conversationMutations, mutation] })),
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
  openPanelWithPrompt: (prompt) => set({ isOpen: true, pendingPrompt: prompt }),
}));

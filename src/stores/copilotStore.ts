import { create } from 'zustand';

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
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  addMessage: (message: CopilotMessage) => void;
  setMessages: (messages: CopilotMessage[]) => void;
  setProcessing: (processing: boolean) => void;
  clearMessages: () => void;
  setConversationId: (id: string | null) => void;
}

export const useCopilotStore = create<CopilotStore>((set) => ({
  isOpen: false,
  messages: [],
  isProcessing: false,
  conversationId: null,
  togglePanel: () => set((s) => {
    console.log('[Copilot] togglePanel →', !s.isOpen);
    return { isOpen: !s.isOpen };
  }),
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setProcessing: (processing) => set({ isProcessing: processing }),
  clearMessages: () => set({ messages: [], conversationId: null }),
  setConversationId: (id) => set({ conversationId: id }),
}));

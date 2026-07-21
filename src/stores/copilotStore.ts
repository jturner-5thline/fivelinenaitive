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

/**
 * Active agent for the Ask naitive AI bar. The bar is the single surface
 * the user talks to; switching agents here changes the persona/system
 * prompt the server uses to answer, while still keeping knowledge and
 * tools from every activated agent available for retrieval.
 *
 * - `kind: 'default'` — the built-in Ask naitive Copilot (no persona override).
 * - `kind: 'admin'` — the Admin Agent (Verify Deal Info) rules + knowledge.
 * - `kind: 'custom'` — a user-configured agent from the `agents` table;
 *   `id` is the agent row id.
 */
export interface CopilotSelectedAgent {
  kind: 'default' | 'admin' | 'custom';
  id: string | null;
  name: string;
  emoji?: string;
}

const AGENT_PREF_KEY = 'naitive.copilot.selected_agent';
function readSelectedAgent(): CopilotSelectedAgent {
  if (typeof window === 'undefined') return { kind: 'default', id: null, name: 'Ask naitive' };
  try {
    const raw = window.sessionStorage.getItem(AGENT_PREF_KEY);
    if (!raw) return { kind: 'default', id: null, name: 'Ask naitive' };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
      return {
        kind: parsed.kind === 'admin' || parsed.kind === 'custom' ? parsed.kind : 'default',
        id: typeof parsed.id === 'string' ? parsed.id : null,
        name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Ask naitive',
        emoji: typeof parsed.emoji === 'string' ? parsed.emoji : undefined,
      };
    }
  } catch { /* ignore */ }
  return { kind: 'default', id: null, name: 'Ask naitive' };
}
function writeSelectedAgent(a: CopilotSelectedAgent) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(AGENT_PREF_KEY, JSON.stringify(a)); } catch { /* ignore */ }
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
  /**
   * Latest disambiguation candidates surfaced by an approval card (e.g.
   * CopilotTaskConfirm) so other surfaces — like the markdown link renderer
   * in AICopilotPanel — can resolve free-form text links (`[Gabb Wireless](#)`)
   * to the right deal id even when the LLM doesn't emit a `deal://<id>` href.
   */
  disambiguationCandidates: Array<{ deal_id: string; name: string }>;
  setDisambiguationCandidates: (
    candidates: Array<{ deal_id: string; name: string }>,
  ) => void;
  clearDisambiguationCandidates: () => void;
  /** Active agent persona for the Ask naitive bar. */
  selectedAgent: CopilotSelectedAgent;
  setSelectedAgent: (a: CopilotSelectedAgent) => void;
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
  disambiguationCandidates: [],
  setDisambiguationCandidates: (candidates) => set({ disambiguationCandidates: candidates }),
  clearDisambiguationCandidates: () => set({ disambiguationCandidates: [] }),
  selectedAgent: readSelectedAgent(),
  setSelectedAgent: (a) => { writeSelectedAgent(a); set({ selectedAgent: a }); },
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
  addMessage: (message) => set((s) => {
    // Dedupe streamed/persisted messages by id. Streaming + persistence
    // races can otherwise push the same assistant message twice, which
    // shows as the same paragraph repeated back-to-back in the ask bar.
    // If an existing message shares the id, replace it in place rather
    // than appending a duplicate.
    const idx = message.id ? s.messages.findIndex((m) => m.id === message.id) : -1;
    const nextMessages = idx >= 0
      ? s.messages.map((m, i) => (i === idx ? message : m))
      : [...s.messages, message];
    const isNew = idx < 0;
    return {
      messages: nextMessages,
      // Treat any state where the user can't see the transcript (closed OR
      // minimized) as needing an unread indicator on the Ask bar.
      unreadCount: isNew && (!s.isOpen || s.isMinimized) && message.role === 'assistant'
        ? s.unreadCount + 1
        : s.unreadCount,
    };
  }),
  setMessages: (messages) => set({
    // Dedupe by id when seeding/replacing the transcript so a duplicated
    // entry from persistence can't leak into render. Last write wins.
    messages: (() => {
      const seen = new Map<string, number>();
      const out: typeof messages = [];
      for (const m of messages) {
        if (m.id && seen.has(m.id)) {
          out[seen.get(m.id)!] = m;
        } else {
          if (m.id) seen.set(m.id, out.length);
          out.push(m);
        }
      }
      return out;
    })(),
  }),
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

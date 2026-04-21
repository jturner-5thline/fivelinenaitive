import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * A pending "deal resolution" request: the system detected something worth
 * suggesting (a contact email in a draft, a Q&A reply, etc.) but the
 * subject + domain match returned multiple candidate deals — so we cannot
 * silently pick one. The user must choose.
 *
 * Once chosen, the consuming component creates the actual
 * `pending_deal_suggestions` row against the picked deal and removes the
 * resolution entry from this store.
 */

export interface DealResolutionCandidate {
  dealId: string;
  dealName: string;
  stage?: string | null;
  domainMatch: boolean;
  nameMatch: boolean;
  score: number;
}

export type DeferredSuggestionIntent =
  | { kind: 'contact_email_from_draft'; payload: any }
  | { kind: 'qa_from_thread'; payload: any };

export interface PendingDealResolution {
  id: string;
  threadId: string;
  threadSubject: string;
  /** Stable key so the same intent doesn't re-prompt on every blur. */
  dedupKey: string;
  intent: DeferredSuggestionIntent;
  candidates: DealResolutionCandidate[];
  /** Short human-readable reason shown in the picker header. */
  reason: string;
  createdAt: string;
}

interface State {
  resolutions: Record<string, PendingDealResolution>; // keyed by id
  enqueue: (r: Omit<PendingDealResolution, 'id' | 'createdAt'>) => string | null;
  remove: (id: string) => void;
  byThread: (threadId: string) => PendingDealResolution[];
  clearForThread: (threadId: string) => void;
}

function makeId(threadId: string, dedupKey: string): string {
  return `${threadId}::${dedupKey}`;
}

export const usePendingDealResolutionsStore = create<State>()(
  persist(
    (set, get) => ({
      resolutions: {},
      enqueue: (r) => {
        const id = makeId(r.threadId, r.dedupKey);
        const existing = get().resolutions[id];
        if (existing) return null; // already prompted for this exact intent
        set((s) => ({
          resolutions: {
            ...s.resolutions,
            [id]: { ...r, id, createdAt: new Date().toISOString() },
          },
        }));
        return id;
      },
      remove: (id) => {
        set((s) => {
          if (!s.resolutions[id]) return s;
          const next = { ...s.resolutions };
          delete next[id];
          return { resolutions: next };
        });
      },
      byThread: (threadId) => {
        const all = Object.values(get().resolutions);
        return all
          .filter((r) => r.threadId === threadId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      clearForThread: (threadId) => {
        set((s) => {
          const next: Record<string, PendingDealResolution> = {};
          for (const [k, v] of Object.entries(s.resolutions)) {
            if (v.threadId !== threadId) next[k] = v;
          }
          return { resolutions: next };
        });
      },
    }),
    {
      name: 'naitive.pendingDealResolutions.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
import { supabase } from '@/integrations/supabase/client';
import { useCopilotStore } from '@/stores/copilotStore';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Demo-only: wipes prior naitive AI chat history on every page refresh so
 * the demo@5thline.co session always starts clean. No-op for any other user.
 *
 * Hard-coded gate — do not parameterise.
 */
export const DEMO_RESET_EMAIL = 'demo@5thline.co';
const SENTINEL_KEY = 'naitive.demo.resetDone';

/** localStorage / sessionStorage key prefixes used by the naitive AI chat layer. */
const CHAT_KEY_PATTERNS: RegExp[] = [
  /^naitive\.ai\.chat\./i,
  /^ai\.chat\./i,
  /^deal-ai-chat[-:]/i,
  /^dashboardChat:/i,
  /^copilot[-:]/i,
];

function wipeStorage(storage: Storage) {
  try {
    const remove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      if (CHAT_KEY_PATTERNS.some((re) => re.test(key))) remove.push(key);
    }
    remove.forEach((k) => storage.removeItem(k));
  } catch {
    /* private mode / quota — ignore */
  }
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === DEMO_RESET_EMAIL;
}

/**
 * Run the one-time-per-page-load demo reset. Idempotent within a tab session
 * via a sessionStorage sentinel; soft route changes do NOT re-trigger.
 */
export async function runDemoAiChatReset(
  email: string | null | undefined,
  queryClient?: QueryClient,
): Promise<void> {
  if (!isDemoEmail(email)) return;
  try {
    if (sessionStorage.getItem(SENTINEL_KEY)) return;
    sessionStorage.setItem(SENTINEL_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — proceed without sentinel.
  }

  // 1. Client-side persistence
  if (typeof window !== 'undefined') {
    wipeStorage(window.localStorage);
    wipeStorage(window.sessionStorage);
  }

  // 2. In-memory stores
  try {
    useCopilotStore.getState().clearMessages();
  } catch {
    /* ignore */
  }

  // 3. React Query caches
  if (queryClient) {
    try {
      queryClient.removeQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === 'string' && (k === 'ai-chat' || k === 'deal-ai-chat' || k.startsWith('ai-chat'));
      } });
    } catch {
      /* ignore */
    }
  }

  // 4. Server-side (fire-and-forget — do not block first paint)
  try {
    const { error } = await (supabase.rpc as any)('reset_demo_ai_chats');
    if (error) console.warn('[demo-reset] rpc error:', error.message);
  } catch (err) {
    console.warn('[demo-reset] rpc threw:', err);
  }
}

/** Test-only: clear the per-tab sentinel so the next call re-runs. */
export function __clearDemoResetSentinelForTests(): void {
  try { sessionStorage.removeItem(SENTINEL_KEY); } catch { /* ignore */ }
}
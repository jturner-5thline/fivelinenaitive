import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_PREFIX = 'dashboardChat:recentPrompts';
const MAX_PROMPTS = 8;

function storageKey(userId: string | undefined) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:anon`;
}

function readPrompts(userId: string | undefined): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string').slice(0, MAX_PROMPTS);
  } catch {
    return [];
  }
}

function writePrompts(userId: string | undefined, prompts: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prompts.slice(0, MAX_PROMPTS)));
  } catch {
    // ignore quota / privacy errors
  }
}

/**
 * Tracks the most recent prompts the user has sent from the dashboard
 * Ask anything bar (and quick-card clicks). Stored per-user in
 * localStorage so the strip survives refresh and navigation.
 */
export function useRecentPrompts() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<string[]>(() => readPrompts(undefined));

  // Re-hydrate when the auth user becomes available or changes.
  useEffect(() => {
    setPrompts(readPrompts(user?.id));
  }, [user?.id]);

  const recordPrompt = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setPrompts(prev => {
      // De-dupe (case-insensitive) and move to front.
      const filtered = prev.filter(p => p.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, MAX_PROMPTS);
      writePrompts(user?.id, next);
      return next;
    });
  }, [user?.id]);

  const clearPrompts = useCallback(() => {
    setPrompts([]);
    writePrompts(user?.id, []);
  }, [user?.id]);

  return { prompts, recordPrompt, clearPrompts };
}

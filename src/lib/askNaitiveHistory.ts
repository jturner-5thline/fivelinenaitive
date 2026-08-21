import { useCallback, useEffect, useState } from 'react';

/**
 * Lightweight, local-only prompt history for the "Ask naitive AI" bar.
 *
 * Stored in localStorage (per browser) so users can revisit and reuse
 * previous prompts without any backend round-trip. Capped so the list
 * stays small and fast.
 */
export interface AskNaitiveHistoryEntry {
  id: string;
  prompt: string;
  at: number;
}

const STORAGE_KEY = 'naitive:ask-history';
const MAX_ENTRIES = 25;
const EVENT = 'naitive:ask-history-changed';

function read(): AskNaitiveHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is AskNaitiveHistoryEntry =>
        !!e && typeof e.prompt === 'string' && typeof e.at === 'number',
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(entries: AskNaitiveHistoryEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota / private mode — history is best-effort */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function recordAskNaitivePrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const existing = read().filter((e) => e.prompt !== trimmed);
  write([
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt: trimmed,
      at: Date.now(),
    },
    ...existing,
  ]);
}

export function useAskNaitiveHistory() {
  const [entries, setEntries] = useState<AskNaitiveHistoryEntry[]>(() => read());

  useEffect(() => {
    const sync = () => setEntries(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter((e) => e.id !== id));
  }, []);

  const clear = useCallback(() => {
    write([]);
  }, []);

  return { entries, remove, clear, record: recordAskNaitivePrompt };
}

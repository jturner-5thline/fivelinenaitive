import { useCallback, useEffect, useRef, useState } from 'react';
import { activateDealDraft, clearDealDraft } from '@/lib/dealDraftRegistry';

export interface UseDebouncedFieldValueOptions<T> {
  /** Debounce window before `commit` fires while the user is still typing. */
  debounceMs?: number;
  /** Called with the latest draft value when the debounce fires, on blur, or on Enter/Tab. */
  commit: (value: T) => void;
  /**
   * Compare remote vs. local draft. When equal, no commit is fired and incoming
   * remote updates are accepted even while focused. Defaults to `Object.is`.
   */
  equals?: (a: T, b: T) => boolean;
  draftKey?: {
    dealId?: string;
    fieldName?: string;
  };
}

export interface UseDebouncedFieldValueResult<T> {
  /** Local draft — bind this to the input's `value`. Never bind to the remote prop. */
  value: T;
  /** Update the local draft and (re)schedule a debounced commit. */
  setValue: (next: T) => void;
  /** Flush any pending commit immediately (use on blur, Enter, Tab). */
  flush: () => void;
  /** Mark the field as focused so remote echoes don't overwrite the draft mid-edit. */
  onFocus: () => void;
  /** Pair with `onFocus` — also flushes any pending commit. */
  onBlur: () => void;
  /** True when the local draft diverges from the most recent remote value. */
  isDirty: boolean;
}

/**
 * Holds a local draft for a controlled input that ultimately persists to a
 * remote store. Solves the classic "characters get dropped while typing"
 * problem caused by binding `value` directly to a server value that gets
 * re-set per-keystroke via an optimistic update or refetch.
 *
 * Contract:
 *   - The input binds to `value` (the local draft), NEVER to `remoteValue`.
 *   - `setValue` updates the draft synchronously and reschedules a debounced
 *     `commit(value)` call (default 500ms).
 *   - `flush()` runs the commit immediately. Call it on blur, Enter, and Tab.
 *   - The remote value is only mirrored back into the draft when the input is
 *     NOT focused AND there is no pending debounce. This guarantees the
 *     server echo never clobbers what the user is currently typing.
 *   - On unmount, pending debounces flush so in-flight edits aren't lost.
 */
export function useDebouncedFieldValue<T>(
  remoteValue: T,
  { debounceMs = 500, commit, equals = Object.is, draftKey }: UseDebouncedFieldValueOptions<T>,
): UseDebouncedFieldValueResult<T> {
  const [value, setLocal] = useState<T>(remoteValue);

  const isFocusedRef = useRef(false);
  const hasPendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const draftRef = useRef<T>(remoteValue);
  const remoteRef = useRef<T>(remoteValue);
  const commitRef = useRef(commit);
  const equalsRef = useRef(equals);

  const registerDraft = useCallback(() => {
    if (draftKey?.dealId && draftKey.fieldName) {
      activateDealDraft(draftKey.dealId, draftKey.fieldName);
    }
  }, [draftKey?.dealId, draftKey?.fieldName]);

  const unregisterDraft = useCallback(() => {
    if (draftKey?.dealId && draftKey.fieldName) {
      clearDealDraft(draftKey.dealId, draftKey.fieldName);
    }
  }, [draftKey?.dealId, draftKey?.fieldName]);

  // Keep latest callbacks without re-running effects.
  useEffect(() => { commitRef.current = commit; }, [commit]);
  useEffect(() => { equalsRef.current = equals; }, [equals]);

  // Mirror remote → local ONLY when safe (not focused, no pending write).
  useEffect(() => {
    remoteRef.current = remoteValue;
    if (isFocusedRef.current || hasPendingRef.current) return;
    if (!equalsRef.current(draftRef.current, remoteValue)) {
      draftRef.current = remoteValue;
      setLocal(remoteValue);
    }
    unregisterDraft();
  }, [remoteValue, unregisterDraft]);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const flush = useCallback(() => {
    clearTimer();
    if (!hasPendingRef.current) return;
    hasPendingRef.current = false;
    const next = draftRef.current;
    if (!equalsRef.current(next, remoteRef.current)) {
      commitRef.current(next);
    }
  }, []);

  const setValue = useCallback((next: T) => {
    draftRef.current = next;
    setLocal(next);
    hasPendingRef.current = !equalsRef.current(next, remoteRef.current);
    clearTimer();
    if (hasPendingRef.current) {
      registerDraft();
    } else if (!isFocusedRef.current) {
      unregisterDraft();
    }
    if (!hasPendingRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, debounceMs);
  }, [debounceMs, flush, registerDraft, unregisterDraft]);

  const onFocus = useCallback(() => {
    isFocusedRef.current = true;
    registerDraft();
  }, [registerDraft]);

  const onBlur = useCallback(() => {
    isFocusedRef.current = false;
    flush();
    if (!hasPendingRef.current) {
      unregisterDraft();
    }
  }, [flush, unregisterDraft]);

  // Flush any pending edit on unmount so we don't drop a fresh keystroke.
  useEffect(() => () => {
    flush();
    unregisterDraft();
  }, [flush, unregisterDraft]);

  return {
    value,
    setValue,
    flush,
    onFocus,
    onBlur,
    isDirty: hasPendingRef.current,
  };
}

/**
 * Convenience: standard key handler that flushes on Enter and Tab without
 * preventing newline insertion in textareas (Shift+Enter passes through).
 */
export function flushOnEnterOrTab(
  flush: () => void,
  opts: { allowShiftEnter?: boolean } = {},
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      flush();
      return;
    }
    if (e.key === 'Enter' && !(opts.allowShiftEnter && e.shiftKey)) {
      flush();
    }
  };
}
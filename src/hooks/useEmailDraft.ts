import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReplyDraft } from '@/components/deal/email/InlineReplyComposer';
import { supabase } from '@/integrations/supabase/client';
import { emailStringToArray, emailArrayToString } from '@/components/deal/email/RecipientField';

const DRAFT_STORAGE_PREFIX = 'email_draft_';

// Debounce window for server-side persistence. The card was specced for 5s
// debounced auto-save; localStorage is still written eagerly on every change
// so we never lose offline edits.
const SERVER_DEBOUNCE_MS = 5000;

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ────────────────────────────────────────────────────────────────────────────
// LocalStorage layer (sync, fast, always available)
// ────────────────────────────────────────────────────────────────────────────

function getDraftKey(threadId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${threadId}`;
}

function saveDraftToStorage(threadId: string, draft: ReplyDraft): boolean {
  try {
    localStorage.setItem(getDraftKey(threadId), JSON.stringify({ ...draft, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function loadDraftFromStorage(threadId: string): ReplyDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { savedAt: _savedAt, ...draft } = parsed;
    return draft as ReplyDraft;
  } catch {
    return null;
  }
}

function deleteDraftFromStorage(threadId: string): void {
  try { localStorage.removeItem(getDraftKey(threadId)); } catch { /* noop */ }
}

function isDraftNonEmpty(draft: ReplyDraft): boolean {
  return !!(draft.body.trim() || draft.attachments.length > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Server layer (Supabase email_drafts table)
// ────────────────────────────────────────────────────────────────────────────

interface ServerDraftRow {
  to_emails: string[] | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  subject: string | null;
  body: string | null;
  attachments: string[] | null;
  to_name: string | null;
}

function rowToDraft(row: ServerDraftRow, threadId: string): ReplyDraft {
  return {
    to: emailArrayToString(row.to_emails ?? []),
    cc: emailArrayToString(row.cc_emails ?? []),
    bcc: emailArrayToString(row.bcc_emails ?? []),
    subject: row.subject ?? '',
    body: row.body ?? '',
    attachments: row.attachments ?? [],
    threadId,
    toName: row.to_name ?? '',
  };
}

async function fetchServerDraft(userId: string, threadId: string): Promise<ReplyDraft | null> {
  const { data, error } = await supabase
    .from('email_drafts')
    .select('to_emails,cc_emails,bcc_emails,subject,body,attachments,to_name')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToDraft(data as ServerDraftRow, threadId);
}

async function upsertServerDraft(userId: string, draft: ReplyDraft): Promise<boolean> {
  const payload = {
    user_id: userId,
    thread_id: draft.threadId,
    to_emails: emailStringToArray(draft.to),
    cc_emails: emailStringToArray(draft.cc),
    bcc_emails: emailStringToArray(draft.bcc),
    subject: draft.subject ?? null,
    body: draft.body ?? null,
    attachments: draft.attachments ?? [],
    to_name: draft.toName ?? null,
  };
  const { error } = await supabase
    .from('email_drafts')
    .upsert(payload, { onConflict: 'user_id,thread_id' });
  return !error;
}

async function deleteServerDraft(userId: string, threadId: string): Promise<void> {
  await supabase
    .from('email_drafts')
    .delete()
    .eq('user_id', userId)
    .eq('thread_id', threadId);
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useEmailDraft(threadId: string) {
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  const draftRef = useRef<ReplyDraft | null>(null);
  const lastSavedRef = useRef<string>('');
  const userIdRef = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current user id once per thread mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) userIdRef.current = data.user?.id ?? null;
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Loads ───────────────────────────────────────────────────────────────
  // Synchronous local fallback for callers that don't want to await.
  const loadDraft = useCallback((): ReplyDraft | null => {
    return loadDraftFromStorage(threadId);
  }, [threadId]);

  // Async server-first loader. Falls back to localStorage if the server has
  // nothing (e.g. older drafts written before this migration).
  const loadServerDraft = useCallback(async (): Promise<ReplyDraft | null> => {
    const uid = userIdRef.current;
    if (!uid) return loadDraftFromStorage(threadId);
    const remote = await fetchServerDraft(uid, threadId);
    if (remote && isDraftNonEmpty(remote)) {
      // Backfill localStorage so optimistic loads stay in sync.
      saveDraftToStorage(threadId, remote);
      return remote;
    }
    return loadDraftFromStorage(threadId);
  }, [threadId]);

  // ── Persistence ─────────────────────────────────────────────────────────

  // Eager local write + debounced server upsert.
  const persistDraft = useCallback((draft: ReplyDraft) => {
    const serialized = JSON.stringify({
      to: draft.to, cc: draft.cc, bcc: draft.bcc,
      subject: draft.subject, body: draft.body,
      attachments: draft.attachments, toName: draft.toName,
    });
    if (serialized === lastSavedRef.current) return;
    if (!isDraftNonEmpty(draft)) {
      // If the draft has been emptied, delete both sides.
      lastSavedRef.current = '';
      deleteDraftFromStorage(threadId);
      const uid = userIdRef.current;
      if (uid) void deleteServerDraft(uid, threadId);
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('saving');
    const localOk = saveDraftToStorage(threadId, draft);
    if (!localOk) setSaveStatus('error');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) {
        // Logged out: local-only is best we can do.
        if (localOk) {
          lastSavedRef.current = serialized;
          setSaveStatus('saved');
        }
        return;
      }
      const ok = await upsertServerDraft(uid, draft);
      if (ok) {
        lastSavedRef.current = serialized;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, SERVER_DEBOUNCE_MS);
  }, [threadId]);

  // Stash latest draft for blur/unload handlers and trigger debounced persist.
  const updateDraft = useCallback((draft: ReplyDraft) => {
    draftRef.current = draft;
    persistDraft(draft);
  }, [persistDraft]);

  // Flush whatever's pending immediately (used on field blur).
  const flushSave = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    const draft = draftRef.current;
    if (!draft || !isDraftNonEmpty(draft)) return;
    saveDraftToStorage(threadId, draft);
    const uid = userIdRef.current;
    if (uid) {
      setSaveStatus('saving');
      const ok = await upsertServerDraft(uid, draft);
      setSaveStatus(ok ? 'saved' : 'error');
      if (ok) {
        lastSavedRef.current = JSON.stringify({
          to: draft.to, cc: draft.cc, bcc: draft.bcc,
          subject: draft.subject, body: draft.body,
          attachments: draft.attachments, toName: draft.toName,
        });
      }
    }
  }, [threadId]);

  // Legacy alias kept for callers that pre-existed the debounce model.
  const saveDraft = useCallback((draft: ReplyDraft) => persistDraft(draft), [persistDraft]);

  // beforeunload: best-effort sync local persistence.
  useEffect(() => {
    const handler = () => {
      if (draftRef.current && isDraftNonEmpty(draftRef.current)) {
        saveDraftToStorage(threadId, draftRef.current);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [threadId]);

  // Tear down debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  const discardDraft = useCallback(() => {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    deleteDraftFromStorage(threadId);
    const uid = userIdRef.current;
    if (uid) void deleteServerDraft(uid, threadId);
    draftRef.current = null;
    lastSavedRef.current = '';
    setSaveStatus('idle');
  }, [threadId]);

  const clearDraftOnSend = useCallback(() => {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    deleteDraftFromStorage(threadId);
    const uid = userIdRef.current;
    if (uid) void deleteServerDraft(uid, threadId);
    draftRef.current = null;
    lastSavedRef.current = '';
    setSaveStatus('idle');
  }, [threadId]);

  const hasSavedDraft = useCallback((): boolean => {
    const draft = loadDraftFromStorage(threadId);
    return draft !== null && isDraftNonEmpty(draft);
  }, [threadId]);

  return {
    loadDraft,
    loadServerDraft,
    updateDraft,
    flushSave,
    saveDraft,
    discardDraft,
    clearDraftOnSend,
    hasSavedDraft,
    saveStatus,
  };
}

/** Hook for navigation guard - warns user if there's unsaved draft content */
export function useUnsavedDraftGuard(hasActiveDraft: boolean) {
  useEffect(() => {
    if (!hasActiveDraft) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have an unsaved email draft. Are you sure you want to leave?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasActiveDraft]);
}

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReplyDraft } from '@/components/deal/email/InlineReplyComposer';

const DRAFT_STORAGE_PREFIX = 'email_draft_';
const AUTOSAVE_INTERVAL_MS = 3000;

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
    // Remove internal metadata before returning
    const { savedAt, ...draft } = parsed;
    return draft as ReplyDraft;
  } catch {
    return null;
  }
}

function deleteDraftFromStorage(threadId: string): void {
  try {
    localStorage.removeItem(getDraftKey(threadId));
  } catch {
    // ignore
  }
}

/** Check if draft has meaningful content worth saving */
function isDraftNonEmpty(draft: ReplyDraft): boolean {
  return !!(draft.body.trim() || draft.attachments.length > 0);
}

export function useEmailDraft(threadId: string) {
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle');
  const draftRef = useRef<ReplyDraft | null>(null);
  const lastSavedRef = useRef<string>('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Load existing draft for this thread
  const loadDraft = useCallback((): ReplyDraft | null => {
    return loadDraftFromStorage(threadId);
  }, [threadId]);

  // Persist current draft
  const saveDraft = useCallback((draft: ReplyDraft) => {
    const serialized = JSON.stringify(draft);
    // Skip if nothing changed
    if (serialized === lastSavedRef.current) return;
    // Only save if there's meaningful content
    if (!isDraftNonEmpty(draft)) return;

    setSaveStatus('saving');
    const success = saveDraftToStorage(threadId, draft);
    if (success) {
      lastSavedRef.current = serialized;
      setSaveStatus('saved');
    } else {
      setSaveStatus('error');
    }
  }, [threadId]);

  // Update the ref and schedule autosave
  const updateDraft = useCallback((draft: ReplyDraft) => {
    draftRef.current = draft;
  }, []);

  // Interval-based autosave
  useEffect(() => {
    const interval = setInterval(() => {
      if (draftRef.current) {
        saveDraft(draftRef.current);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [saveDraft]);

  // Save on beforeunload
  useEffect(() => {
    const handler = () => {
      if (draftRef.current && isDraftNonEmpty(draftRef.current)) {
        saveDraftToStorage(threadId, draftRef.current);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [threadId]);

  // Flush save (immediate, for blur events etc)
  const flushSave = useCallback(() => {
    if (draftRef.current) {
      saveDraft(draftRef.current);
    }
  }, [saveDraft]);

  // Delete draft explicitly
  const discardDraft = useCallback(() => {
    deleteDraftFromStorage(threadId);
    draftRef.current = null;
    lastSavedRef.current = '';
    setSaveStatus('idle');
  }, [threadId]);

  // Cleanup on send
  const clearDraftOnSend = useCallback(() => {
    deleteDraftFromStorage(threadId);
    draftRef.current = null;
    lastSavedRef.current = '';
    setSaveStatus('idle');
  }, [threadId]);

  // Check if a saved draft exists for this thread
  const hasSavedDraft = useCallback((): boolean => {
    const draft = loadDraftFromStorage(threadId);
    return draft !== null && isDraftNonEmpty(draft);
  }, [threadId]);

  return {
    loadDraft,
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

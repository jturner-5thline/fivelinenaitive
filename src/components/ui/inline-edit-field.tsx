import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { activateDealDraft, clearDealDraft } from '@/lib/dealDraftRegistry';

interface InlineEditFieldProps {
  value: string;
  /**
   * Persist a new value. May return a Promise; if it rejects the field
   * rolls back to the last saved value and surfaces a retry toast.
   */
  onSave: (value: string) => void | Promise<void>;
  type?: 'text' | 'textarea' | 'number';
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  /** Debounce window for autosave while the user is still typing. */
  debounceMs?: number;
  dealId?: string;
  fieldName?: string;
}

/**
 * Click-to-edit text/number/textarea field with autosave semantics:
 *   - editing begins on click; no explicit confirm/cancel buttons
 *   - typing schedules a debounced save (default 600ms)
 *   - blur and Enter flush immediately and exit edit mode
 *   - Esc reverts to the last persisted value
 *   - in-flight writes coalesce: only the most recent value is persisted
 *   - shows a "Saving…" spinner while a write is in flight and a "Saved"
 *     check for 1.5s after success
 */
export function InlineEditField({
  value,
  onSave,
  type = 'text',
  placeholder = 'Click to edit',
  className,
  displayClassName,
  inputClassName,
  debounceMs = 600,
  dealId,
  fieldName,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isFocusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastCommittedRef = useRef(value ?? '');
  const debounceTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const latestResolvedRequestIdRef = useRef(0);

  const registerDraft = useCallback(() => {
    if (dealId && fieldName) activateDealDraft(dealId, fieldName);
  }, [dealId, fieldName]);

  const unregisterDraft = useCallback(() => {
    if (dealId && fieldName) clearDealDraft(dealId, fieldName);
  }, [dealId, fieldName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const nextValue = value ?? '';
    if (!isFocusedRef.current && !dirtyRef.current && nextValue !== lastCommittedRef.current) {
      setDraft(nextValue);
      lastCommittedRef.current = nextValue;
    }
  }, [value]);

  useEffect(() => {
    if (!fieldName || !import.meta.env.DEV) return;
    console.debug('mount', fieldName);
  }, [fieldName]);

  useEffect(() => () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    if (dirtyRef.current) {
      const next = draft;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      void Promise.resolve(onSave(next))
        .then(() => {
          if (requestId < latestResolvedRequestIdRef.current) return;
          latestResolvedRequestIdRef.current = requestId;
          dirtyRef.current = false;
          unregisterDraft();
          lastCommittedRef.current = next;
        })
        .catch(() => undefined);
    } else {
      unregisterDraft();
    }
  }, []);

  const commit = useCallback(async (next: string) => {
    if (next === lastCommittedRef.current) {
      dirtyRef.current = false;
      unregisterDraft();
      return;
    }

    registerDraft();
    setStatus('saving');
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      await Promise.resolve(onSave(next));
      if (requestId < latestResolvedRequestIdRef.current) return;
      latestResolvedRequestIdRef.current = requestId;
      lastCommittedRef.current = next;
      dirtyRef.current = false;
      unregisterDraft();
      setStatus('saved');
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save change';
      setStatus('error');
      setDraft(lastCommittedRef.current);
      dirtyRef.current = false;
      unregisterDraft();
      toast.error('Failed to save', {
        description: message,
        action: { label: 'Retry', onClick: () => commit(next) },
      });
    }
  }, [onSave, registerDraft, unregisterDraft]);

  const scheduleCommit = useCallback((next: string) => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      commit(next);
    }, debounceMs);
  }, [commit, debounceMs]);

  const flushCommit = useCallback((next: string) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    commit(next);
  }, [commit]);

  const handleChange = (next: string) => {
    setDraft(next);
    dirtyRef.current = true;
    registerDraft();
    scheduleCommit(next);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    flushCommit(draft);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (type === 'textarea' && e.shiftKey) return;
      e.preventDefault();
      flushCommit(draft);
      (inputRef.current as HTMLElement | null)?.blur();
    } else if (e.key === 'Tab') {
      flushCommit(draft);
    } else if (e.key === 'Escape') {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      dirtyRef.current = false;
      unregisterDraft();
      setDraft(lastCommittedRef.current);
      setIsEditing(false);
    }
  };

  const statusBadge =
    status === 'saving' ? (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    ) : status === 'saved' ? (
      <span className="inline-flex items-center gap-1 text-xs text-success" aria-live="polite">
        <Check className="h-3 w-3" /> Saved
      </span>
    ) : null;

  if (isEditing) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {type === 'textarea' ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              isFocusedRef.current = true;
              registerDraft();
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn('min-h-[80px]', inputClassName)}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => {
              isFocusedRef.current = true;
              registerDraft();
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn('h-8', inputClassName)}
          />
        )}
        {statusBadge}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors',
        displayClassName,
      )}
      onClick={() => setIsEditing(true)}
    >
      <span className={cn('flex-1', !lastCommittedRef.current && 'text-muted-foreground/50 italic')}>
        {lastCommittedRef.current || placeholder}
      </span>
      {statusBadge}
    </div>
  );
}

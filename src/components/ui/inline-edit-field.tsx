import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Last value successfully persisted (or seeded from props). Esc reverts here.
  const lastSavedRef = useRef(value);
  // Most recent value the user typed — used to coalesce queued writes.
  const pendingRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Mirror external value changes while the user isn't actively editing /
  // saving (e.g. realtime update, parent refetch).
  useEffect(() => {
    if (!isEditing && !inFlightRef.current) {
      lastSavedRef.current = value;
      setEditValue(value);
    }
  }, [value, isEditing]);

  useEffect(() => () => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
  }, []);

  const commit = useCallback(async (next: string) => {
    if (next === lastSavedRef.current) return;
    if (inFlightRef.current) {
      // Race-condition guard: keep only the latest queued value.
      pendingRef.current = next;
      return;
    }
    inFlightRef.current = true;
    setStatus('saving');
    try {
      await Promise.resolve(onSave(next));
      lastSavedRef.current = next;
      setStatus('saved');
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save change';
      setStatus('error');
      setEditValue(lastSavedRef.current);
      toast.error('Failed to save', {
        description: message,
        action: { label: 'Retry', onClick: () => commit(next) },
      });
    } finally {
      inFlightRef.current = false;
      const queued = pendingRef.current;
      pendingRef.current = null;
      if (queued !== null && queued !== lastSavedRef.current) {
        // Flush the most-recent value the user typed during the flight.
        commit(queued);
      }
    }
  }, [onSave]);

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
    setEditValue(next);
    scheduleCommit(next);
  };

  const handleBlur = () => {
    flushCommit(editValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (type === 'textarea' && e.shiftKey) return;
      e.preventDefault();
      flushCommit(editValue);
      (inputRef.current as HTMLElement | null)?.blur();
    } else if (e.key === 'Escape') {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingRef.current = null;
      setEditValue(lastSavedRef.current);
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
            value={editValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cn('min-h-[80px]', inputClassName)}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={editValue}
            onChange={(e) => handleChange(e.target.value)}
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
      <span className={cn('flex-1', !value && 'text-muted-foreground/50 italic')}>
        {value || placeholder}
      </span>
      {statusBadge}
    </div>
  );
}

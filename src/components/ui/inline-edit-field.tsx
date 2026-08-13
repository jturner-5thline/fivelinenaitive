import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { activateDealDraft, clearDealDraft } from '@/lib/dealDraftRegistry';

interface InlineEditFieldProps {
  value: string;
  /**
   * Optional raw value shown while the field is focused/edited.
   * When provided, `value` is used for the read-only display and
   * `editValue` is loaded into the input on focus. `onSave` receives
   * the (sanitized) edited string for the parent to parse.
   */
  editValue?: string;
  /**
   * Optional sanitizer applied to each keystroke / paste while editing.
   * Use to restrict input (e.g. numeric-only currency).
   */
  sanitizeInput?: (next: string) => string;
  onSave: (value: string) => void | Promise<void>;
  type?: 'text' | 'textarea' | 'number';
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  displayStyle?: React.CSSProperties;
  inputClassName?: string;
  debounceMs?: number;
  dealId?: string;
  fieldName?: string;
  /**
   * When true, edits are never auto-saved — the user must explicitly
   * confirm with Save (or Enter) or discard with Cancel (or Escape).
   */
  manualCommit?: boolean;
}

export function InlineEditField({
  value,
  editValue,
  sanitizeInput,
  onSave,
  type = 'text',
  placeholder = 'Click to edit',
  className,
  displayClassName,
  displayStyle,
  inputClassName,
  debounceMs = 500,
  dealId,
  fieldName,
  manualCommit = false,
}: InlineEditFieldProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isFocusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastCommittedRef = useRef(value ?? '');
  const latestRequestedRef = useRef(0);
  const latestResolvedRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  const registerDraft = useCallback(() => {
    if (dealId && fieldName) activateDealDraft(dealId, fieldName);
  }, [dealId, fieldName]);

  const unregisterDraft = useCallback(() => {
    if (dealId && fieldName) clearDealDraft(dealId, fieldName);
  }, [dealId, fieldName]);

  useEffect(() => {
    const nextValue = value ?? '';
    if (!isFocusedRef.current && !dirtyRef.current && nextValue !== lastCommittedRef.current) {
      setDraft(nextValue);
      lastCommittedRef.current = nextValue;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      unregisterDraft();
    };
  }, [unregisterDraft]);

  const commit = useCallback(async (next: string) => {
    if (next === lastCommittedRef.current) {
      dirtyRef.current = false;
      setIsDirty(false);
      unregisterDraft();
      return;
    }

    const requestId = latestRequestedRef.current + 1;
    latestRequestedRef.current = requestId;
    registerDraft();
    setStatus('saving');

    try {
      await Promise.resolve(onSave(next));
      if (requestId < latestResolvedRef.current) return;

      latestResolvedRef.current = requestId;
      lastCommittedRef.current = next;
      dirtyRef.current = false;
      setIsDirty(false);
      unregisterDraft();
      setStatus('saved');
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      if (requestId < latestResolvedRef.current) return;

      const message = err instanceof Error ? err.message : 'Could not save change';
      setStatus('error');
      dirtyRef.current = false;
      setIsDirty(false);
      unregisterDraft();
      setDraft(lastCommittedRef.current);
      toast.error('Failed to save', {
        description: message,
        action: { label: 'Retry', onClick: () => commit(next) },
      });
    }
  }, [onSave, registerDraft, unregisterDraft]);

  const flush = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!dirtyRef.current) return;
    void commit(draft);
  }, [commit, draft]);

  const scheduleCommit = useCallback((next: string) => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void commit(next);
    }, debounceMs);
  }, [commit, debounceMs]);

  const handleChange = (next: string) => {
    const cleaned = sanitizeInput ? sanitizeInput(next) : next;
    setDraft(cleaned);
    dirtyRef.current = true;
    setIsDirty(true);
    registerDraft();
    if (!manualCommit) scheduleCommit(cleaned);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    setIsFocused(true);
    if (editValue !== undefined) {
      setDraft(editValue);
    }
    registerDraft();
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    setIsFocused(false);
    // Manual mode keeps the pending edit alive so Save/Cancel stay usable.
    if (manualCommit) {
      if (!dirtyRef.current) {
        unregisterDraft();
        if (editValue !== undefined) setDraft(lastCommittedRef.current);
      }
      return;
    }
    flush();
    if (!dirtyRef.current) {
      unregisterDraft();
      // Restore display value when the user blurred without edits.
      if (editValue !== undefined) {
        setDraft(lastCommittedRef.current);
      }
    }
  };

  const handleCancel = useCallback(() => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    dirtyRef.current = false;
    setIsDirty(false);
    unregisterDraft();
    setDraft(lastCommittedRef.current);
    setStatus('idle');
    inputRef.current?.blur();
  }, [unregisterDraft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      handleCancel();
      return;
    }

    if (e.key === 'Tab') {
      if (!manualCommit) flush();
      return;
    }

    if (e.key === 'Enter' && !(type === 'textarea' && e.shiftKey)) {
      if (type !== 'textarea') {
        e.preventDefault();
      }
      flush();
      if (type !== 'textarea') {
        inputRef.current?.blur();
      }
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

  const manualActions =
    manualCommit && isDirty && status !== 'saving' ? (
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          size="sm"
          className="h-6 px-2 text-xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void commit(draft)}
        >
          <Check className="h-3 w-3 mr-1" /> Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCancel}
        >
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
      </div>
    ) : null;

  const sharedInputProps = {
    ref: inputRef as React.RefObject<HTMLInputElement> & React.RefObject<HTMLTextAreaElement>,
    value: draft,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    placeholder,
    'aria-label': fieldName ?? placeholder,
  };

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      {type === 'textarea' ? (
        <Textarea
          {...sharedInputProps}
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          style={displayStyle}
          className={cn(
            'w-full min-h-[80px] border-transparent bg-transparent px-1 py-1 shadow-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0',
            !isFocused && 'hover:bg-muted/40',
            displayClassName,
            inputClassName,
          )}
        />
      ) : (
        <Input
          {...sharedInputProps}
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          style={displayStyle}
          className={cn(
            // h-auto + leading-tight override the shadcn Input default
            // (h-10) which was clipping large title typography (e.g.
            // text-5xl) in the deal header card.
            'w-full min-w-0 h-auto leading-tight border-transparent bg-transparent px-1 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
            !isFocused && 'hover:bg-muted/40',
            displayClassName,
            inputClassName,
          )}
        />
      )}
      {statusBadge}
      {manualActions}
    </div>
  );
}
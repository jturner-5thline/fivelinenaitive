import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { activateDealDraft, clearDealDraft } from '@/lib/dealDraftRegistry';

interface InlineEditFieldProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  type?: 'text' | 'textarea' | 'number';
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  debounceMs?: number;
  dealId?: string;
  fieldName?: string;
}

export function InlineEditField({
  value,
  onSave,
  type = 'text',
  placeholder = 'Click to edit',
  className,
  displayClassName,
  inputClassName,
  debounceMs = 500,
  dealId,
  fieldName,
}: InlineEditFieldProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
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
      unregisterDraft();
      setStatus('saved');
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      if (requestId < latestResolvedRef.current) return;

      const message = err instanceof Error ? err.message : 'Could not save change';
      setStatus('error');
      dirtyRef.current = false;
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
    setDraft(next);
    dirtyRef.current = true;
    registerDraft();
    scheduleCommit(next);
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    setIsFocused(true);
    registerDraft();
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    setIsFocused(false);
    flush();
    if (!dirtyRef.current) unregisterDraft();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      dirtyRef.current = false;
      unregisterDraft();
      setDraft(lastCommittedRef.current);
      setStatus('idle');
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Tab') {
      flush();
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
    </div>
  );
}
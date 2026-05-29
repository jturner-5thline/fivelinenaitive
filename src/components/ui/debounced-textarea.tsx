import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedFieldValue, flushOnEnterOrTab } from '@/hooks/useDebouncedFieldValue';

interface DebouncedTextareaProps extends Omit<React.ComponentProps<typeof Textarea>, 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  debounceMs?: number;
  showSaveIndicator?: boolean;
}

/**
 * A textarea that uses local state for immediate UI updates
 * and debounces the actual save/change callback to prevent
 * performance issues from saving on every keystroke.
 */
export function DebouncedTextarea({
  value,
  onValueChange,
  debounceMs = 500,
  showSaveIndicator = false,
  className,
  ...props
}: DebouncedTextareaProps) {
  const [saveState, setSaveState] = React.useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const successTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleCommit = React.useCallback((next: string) => {
    setSaveState('saving');
    onValueChange(next);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    successTimeoutRef.current = setTimeout(() => {
      setSaveState('saved');
      successTimeoutRef.current = setTimeout(() => setSaveState('idle'), 1500);
    }, 300);
  }, [onValueChange]);

  const {
    value: localValue,
    setValue: setLocalValue,
    flush,
    onFocus: onFocusDraft,
    onBlur: onBlurDraft,
  } = useDebouncedFieldValue<string>(value ?? '', {
    commit: handleCommit,
    debounceMs,
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    setSaveState('pending');
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlurDraft();
    props.onBlur?.(e);
  };

  React.useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <Textarea
        {...props}
        value={localValue}
        onChange={handleChange}
        onFocus={(e) => { onFocusDraft(); props.onFocus?.(e); }}
        onBlur={handleBlur}
        onKeyDown={(e) => { flushOnEnterOrTab(flush)(e); props.onKeyDown?.(e); }}
        className={cn(className)}
      />
      {showSaveIndicator && saveState !== 'idle' && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {saveState === 'pending' && (
            <span className="text-xs text-muted-foreground">Typing...</span>
          )}
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-success animate-in fade-in duration-200">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}

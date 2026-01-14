import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [localValue, setLocalValue] = React.useState(value);
  const [saveState, setSaveState] = React.useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const successTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isInternalUpdate = React.useRef(false);

  // Sync local value when external value changes (but not from our own updates)
  React.useEffect(() => {
    if (!isInternalUpdate.current) {
      setLocalValue(value);
    }
    isInternalUpdate.current = false;
  }, [value]);

  const triggerSave = React.useCallback((newValue: string) => {
    setSaveState('saving');
    onValueChange(newValue);
    
    // Show success state briefly
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = setTimeout(() => {
      setSaveState('saved');
      successTimeoutRef.current = setTimeout(() => {
        setSaveState('idle');
      }, 1500);
    }, 300);
  }, [onValueChange]);

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    isInternalUpdate.current = true;
    setSaveState('pending');

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new debounced save
    timeoutRef.current = setTimeout(() => {
      triggerSave(newValue);
    }, debounceMs);
  }, [triggerSave, debounceMs]);

  // Save immediately on blur
  const handleBlur = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (localValue !== value) {
      triggerSave(localValue);
    }
    props.onBlur?.(e);
  }, [localValue, value, triggerSave, props.onBlur]);

  // Cleanup timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <Textarea
        {...props}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
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

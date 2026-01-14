import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface DebouncedTextareaProps extends React.ComponentProps<typeof Textarea> {
  value: string;
  onValueChange: (value: string) => void;
  debounceMs?: number;
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
  className,
  ...props
}: DebouncedTextareaProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isInternalUpdate = React.useRef(false);

  // Sync local value when external value changes (but not from our own updates)
  React.useEffect(() => {
    if (!isInternalUpdate.current) {
      setLocalValue(value);
    }
    isInternalUpdate.current = false;
  }, [value]);

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    isInternalUpdate.current = true;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new debounced save
    timeoutRef.current = setTimeout(() => {
      onValueChange(newValue);
    }, debounceMs);
  }, [onValueChange, debounceMs]);

  // Save immediately on blur
  const handleBlur = React.useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (localValue !== value) {
      onValueChange(localValue);
    }
    props.onBlur?.(e);
  }, [localValue, value, onValueChange, props.onBlur]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Textarea
      {...props}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(className)}
    />
  );
}

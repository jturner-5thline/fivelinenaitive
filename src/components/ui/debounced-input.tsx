import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DebouncedInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange'> {
  value: string | number;
  onChange: (value: string | number) => void;
  onSave?: () => void;
  debounceMs?: number;
  type?: string;
}

/**
 * A debounced input that only calls onChange after the user stops typing.
 * Updates local state immediately for responsive UI, then syncs to parent after delay.
 */
export function DebouncedInput({
  value,
  onChange,
  onSave,
  debounceMs = 800,
  type = 'text',
  className,
  ...props
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isFocusedRef = React.useRef(false);
  const hasPendingChangesRef = React.useRef(false);

  // Sync from parent when value changes externally, but only if not focused
  React.useEffect(() => {
    // Don't override local value while user is actively editing
    if (!isFocusedRef.current && !hasPendingChangesRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    hasPendingChangesRef.current = true;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule debounced save
    timeoutRef.current = setTimeout(() => {
      const finalValue = type === 'number' ? (newValue === '' ? 0 : Number(newValue)) : newValue;
      onChange(finalValue);
      hasPendingChangesRef.current = false;
    }, debounceMs);
  };

  const saveNow = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    if (hasPendingChangesRef.current) {
      const finalValue = type === 'number' 
        ? (localValue === '' ? 0 : Number(localValue)) 
        : localValue;
      onChange(finalValue);
      hasPendingChangesRef.current = false;
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    saveNow();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNow();
      (e.target as HTMLInputElement).blur();
      onSave?.();
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <Input
      {...props}
      type={type}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(className)}
    />
  );
}

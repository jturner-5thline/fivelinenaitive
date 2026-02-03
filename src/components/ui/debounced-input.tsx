import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DebouncedInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange'> {
  value: string | number;
  onChange: (value: string | number) => void;
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
  debounceMs = 800,
  type = 'text',
  className,
  ...props
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastSyncedRef = React.useRef(value);

  // Sync from parent when value changes externally
  React.useEffect(() => {
    if (value !== lastSyncedRef.current) {
      setLocalValue(value);
      lastSyncedRef.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = type === 'number' ? e.target.value : e.target.value;
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule debounced save
    timeoutRef.current = setTimeout(() => {
      const finalValue = type === 'number' ? (newValue === '' ? 0 : Number(newValue)) : newValue;
      onChange(finalValue);
      lastSyncedRef.current = finalValue;
    }, debounceMs);
  };

  const handleBlur = () => {
    // Save immediately on blur
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const finalValue = type === 'number' 
      ? (localValue === '' ? 0 : Number(localValue)) 
      : localValue;
    if (finalValue !== lastSyncedRef.current) {
      onChange(finalValue);
      lastSyncedRef.current = finalValue;
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
      onBlur={handleBlur}
      className={cn(className)}
    />
  );
}

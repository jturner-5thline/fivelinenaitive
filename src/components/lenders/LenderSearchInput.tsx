import { memo, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface LenderSearchInputProps {
  /** Called with the debounced query. Must be a stable reference. */
  onDebouncedChange: (value: string) => void;
  delay?: number;
}

/**
 * Self-contained search box for the funding sources directory.
 *
 * Keeping the raw keystroke state local means typing re-renders only this
 * input instead of the entire (very large) Lenders page, which is what made
 * the directory feel frozen while searching. The parent only hears about the
 * debounced value.
 */
export const LenderSearchInput = memo(function LenderSearchInput({
  onDebouncedChange,
  delay = 250,
}: LenderSearchInputProps) {
  const [value, setValue] = useState('');
  const cbRef = useRef(onDebouncedChange);
  cbRef.current = onDebouncedChange;

  useEffect(() => {
    const t = setTimeout(() => cbRef.current(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return (
    <div className="flex-1 min-w-[180px] max-w-md relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Search funding sources…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="lg-input h-8 pl-8 pr-7 text-sm"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
});

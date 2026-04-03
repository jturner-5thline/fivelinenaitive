import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CollapsibleSearch({ value, onChange }: CollapsibleSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = expanded || value.length > 0;

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleBlur = () => {
    if (value.length === 0) {
      setExpanded(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setExpanded(false);
  };

  return (
    <div
      className={cn(
        'relative flex items-center h-9 rounded-md border border-input bg-background cursor-text transition-all duration-200 ease-in-out',
        isActive ? 'w-[180px]' : 'w-9',
        isActive && 'hover:border-ring'
      )}
      onClick={() => {
        setExpanded(true);
      }}
      role="search"
      aria-label="Search deals"
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={handleBlur}
        placeholder="Search..."
        aria-label="Search deals"
        className={cn(
          'h-full w-full bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground transition-opacity duration-200',
          isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />
      {value.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

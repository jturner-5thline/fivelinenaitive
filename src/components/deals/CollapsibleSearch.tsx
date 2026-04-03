import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollapsibleSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CollapsibleSearch({ value, onChange }: CollapsibleSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Collapsed: render an actual Button matching Filters button exactly
  if (!isActive) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 h-9 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
        onClick={() => setExpanded(true)}
        aria-label="Search deals"
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  // Expanded: input styled to match the Button's border/height/radius
  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center h-9 w-[180px] rounded-md border border-input bg-background text-sm transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={handleBlur}
        placeholder="Search..."
        aria-label="Search deals"
        className="h-full w-full bg-transparent pl-8 pr-7 outline-none text-sm placeholder:text-muted-foreground"
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

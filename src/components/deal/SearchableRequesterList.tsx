import { useState, useRef, useEffect } from 'react';
import { Check, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface SearchableRequesterListProps {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}

export function SearchableRequesterList({ options, selected, onToggle }: SearchableRequesterListProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus search on mount
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <>
      <div className="p-1.5 border-b border-border">
        <div className="flex items-center gap-1.5 px-2 rounded-md border border-input bg-background">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full py-1.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="pointer-events-auto relative z-[100] max-h-[250px] overflow-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>
        ) : (
          filtered.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                type="button"
                key={option}
                className={cn(
                  'pointer-events-auto relative z-[100] flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                  isSelected && 'bg-accent/50'
                )}
                onClick={() => onToggle(option)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(option)}
                  className="pointer-events-none"
                />
                <span className="flex-1 truncate">{option}</span>
                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

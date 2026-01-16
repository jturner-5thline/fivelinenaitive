import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface LenderSearchInputProps {
  lenderNames: string[];
  existingLenderNames: string[];
  onAddLender: (name: string) => void;
}

export function LenderSearchInput({ 
  lenderNames, 
  existingLenderNames, 
  onAddLender 
}: LenderSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Only show dropdown when there's text to filter
  const shouldShowDropdown = searchQuery.trim().length > 0;

  // Debounce the search query (150ms delay)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  // Filter lenders using debounced query and limit to top 20 for performance
  const filteredLenderNames = useMemo(() => {
    const trimmedQuery = debouncedQuery.trim();
    if (!trimmedQuery) return [];
    const searchLower = trimmedQuery.toLowerCase();
    return lenderNames
      .filter(
        name => !existingLenderNames.includes(name) &&
        name.toLowerCase().includes(searchLower)
      )
      .slice(0, 20);
  }, [lenderNames, existingLenderNames, debouncedQuery]);

  const handleAddLender = useCallback((name: string) => {
    onAddLender(name);
    setSearchQuery('');
    setIsOpen(false);
  }, [onAddLender]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (filteredLenderNames.length > 0) {
        handleAddLender(filteredLenderNames[0]);
      } else {
        handleAddLender(searchQuery);
      }
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [searchQuery, filteredLenderNames, handleAddLender]);

  // Highlight matching text in lender name
  const highlightMatch = useCallback((name: string) => {
    if (!searchQuery.trim()) return name;
    const searchLower = searchQuery.toLowerCase();
    const index = name.toLowerCase().indexOf(searchLower);
    if (index === -1) return name;
    
    const before = name.slice(0, index);
    const match = name.slice(index, index + searchQuery.length);
    const after = name.slice(index + searchQuery.length);
    
    return (
      <>
        {before}<span className="font-semibold text-primary">{match}</span>{after}
      </>
    );
  }, [searchQuery]);

  return (
    <Popover open={isOpen && shouldShowDropdown} onOpenChange={(open) => {
      // Only allow closing via our explicit handlers, not Radix internal events
      if (!open) return;
      setIsOpen(open);
    }}>
      <PopoverTrigger asChild>
        <div className="flex-1 max-w-[50%]">
          <Input
            placeholder="Type to add a lender..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0 max-h-48 overflow-auto" 
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filteredLenderNames.map((lenderName) => (
          <button
            key={lenderName}
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={() => handleAddLender(lenderName)}
          >
            {highlightMatch(lenderName)}
          </button>
        ))}
        {filteredLenderNames.length === 0 && searchQuery.trim() && (
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={() => handleAddLender(searchQuery)}
          >
            Add "{searchQuery}" as new lender
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

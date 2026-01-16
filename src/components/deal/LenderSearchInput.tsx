import { useState, useMemo, useCallback, useDeferredValue } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);

  // Keep typing responsive while deferring expensive list filtering.
  const deferredQuery = useDeferredValue(searchQuery);

  // Only show dropdown when there's text to filter
  const shouldShowDropdown = searchQuery.trim().length > 0;

  const existingLenderNamesSet = useMemo(() => new Set(existingLenderNames), [existingLenderNames]);

  const computeMatches = useCallback((rawQuery: string) => {
    const trimmedQuery = rawQuery.trim();
    if (!trimmedQuery) return [];

    const searchLower = trimmedQuery.toLowerCase();
    const limit = 20;

    // "Closest" matches first: prefix matches, then substring matches.
    const prefixMatches: string[] = [];
    for (const name of lenderNames) {
      if (existingLenderNamesSet.has(name)) continue;
      const lower = name.toLowerCase();
      if (lower.startsWith(searchLower)) {
        prefixMatches.push(name);
        if (prefixMatches.length >= limit) return prefixMatches;
      }
    }

    const containsMatches: string[] = [];
    for (const name of lenderNames) {
      if (existingLenderNamesSet.has(name)) continue;
      const lower = name.toLowerCase();
      if (!lower.startsWith(searchLower) && lower.includes(searchLower)) {
        containsMatches.push(name);
        if (prefixMatches.length + containsMatches.length >= limit) break;
      }
    }

    return prefixMatches.concat(containsMatches).slice(0, limit);
  }, [lenderNames, existingLenderNamesSet]);

  const filteredLenderNames = useMemo(() => computeMatches(deferredQuery), [computeMatches, deferredQuery]);

  const handleAddLender = useCallback((name: string) => {
    onAddLender(name);
    setSearchQuery('');
    setIsOpen(false);
  }, [onAddLender]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const matches = computeMatches(searchQuery);
      if (matches.length > 0) {
        handleAddLender(matches[0]);
      } else {
        handleAddLender(searchQuery.trim());
      }
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [searchQuery, computeMatches, handleAddLender]);

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

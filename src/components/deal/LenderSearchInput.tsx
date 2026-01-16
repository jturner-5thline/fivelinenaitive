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

  // Match score: lower is better. Returns Infinity if no match.
  const matchScore = useCallback((name: string, query: string): number => {
    const nameLower = name.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact prefix match is best
    if (nameLower.startsWith(queryLower)) {
      return queryLower.length / nameLower.length; // Higher coverage = lower score
    }

    // Word-start match (e.g., "cap" matches "Capital One")
    const words = nameLower.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      if (words[i].startsWith(queryLower)) {
        return 1 + (1 - queryLower.length / words[i].length);
      }
    }

    // Exact substring match
    if (nameLower.includes(queryLower)) {
      return 2 + nameLower.indexOf(queryLower) / nameLower.length;
    }

    // No fuzzy matching - only exact matches allowed
    return Infinity;
  }, []);

  const computeMatches = useCallback((rawQuery: string) => {
    const trimmedQuery = rawQuery.trim();
    if (!trimmedQuery) return [];

    const limit = 20;
    const scored: { name: string; score: number }[] = [];

    for (const name of lenderNames) {
      if (existingLenderNamesSet.has(name)) continue;
      const score = matchScore(name, trimmedQuery);
      if (score !== Infinity) {
        scored.push({ name, score });
      }
    }

    // Sort by score (lower is better), then by name length (shorter first), then alphabetically
    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name);
    });

    return scored.slice(0, limit).map(s => s.name);
  }, [lenderNames, existingLenderNamesSet, matchScore]);

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

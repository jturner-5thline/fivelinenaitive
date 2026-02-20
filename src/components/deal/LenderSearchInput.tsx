import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus } from 'lucide-react';

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

  // Only show dropdown when there's meaningful text to filter (at least 2 chars)
  const shouldShowDropdown = searchQuery.trim().length >= 2;

  const existingLenderNamesSet = useMemo(() => new Set(existingLenderNames), [existingLenderNames]);

  // Filter lenders: ONLY include if name contains the search query (case-insensitive)
  const filteredLenderNames = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    // Require at least 2 characters to start filtering
    if (trimmedQuery.length < 2) return [];

    const queryLower = trimmedQuery.toLowerCase();
    const limit = 15; // Reduced limit for cleaner results
    const matches: { name: string; score: number; coverage: number; isExisting: boolean }[] = [];

    for (const name of lenderNames) {
      const isExisting = existingLenderNamesSet.has(name);
      
      const nameLower = name.toLowerCase();
      const nameNoSpaces = nameLower.replace(/\s+/g, '');
      const queryNoSpaces = queryLower.replace(/\s+/g, '');
      
      // STRICT: Only include if name contains the search text (ignoring spaces)
      if (!nameNoSpaces.includes(queryNoSpaces)) continue;

      // Score: prefix match = 0, word-start match = 1, substring = 2
      let score: number;
      if (nameLower.startsWith(queryLower)) {
        score = 0;
      } else {
        const words = nameLower.split(/\s+/);
        const wordStartMatch = words.some(word => word.startsWith(queryLower));
        score = wordStartMatch ? 1 : 2;
      }

      const coverage = queryLower.length / nameLower.length;

      matches.push({ name, score, coverage, isExisting });
    }

    // Sort: non-existing first, then by score/position/length/coverage
    matches.sort((a, b) => {
      // Existing lenders go to the bottom
      if (a.isExisting !== b.isExisting) return a.isExisting ? 1 : -1;
      
      if (a.score !== b.score) return a.score - b.score;

      const aLower = a.name.toLowerCase();
      const bLower = b.name.toLowerCase();

      const aIndex = aLower.indexOf(queryLower);
      const bIndex = bLower.indexOf(queryLower);
      if (aIndex !== bIndex) return aIndex - bIndex;

      const aLenDelta = Math.abs(aLower.length - queryLower.length);
      const bLenDelta = Math.abs(bLower.length - queryLower.length);
      if (aLenDelta !== bLenDelta) return aLenDelta - bLenDelta;

      if (a.coverage !== b.coverage) return b.coverage - a.coverage;
      return a.name.localeCompare(b.name);
    });

    return matches.slice(0, limit).map(m => ({ name: m.name, isExisting: m.isExisting }));
  }, [lenderNames, existingLenderNamesSet, searchQuery]);

  // Check if a name already exists (exact match)
  const isLenderAlreadyAdded = useCallback((name: string) => {
    return existingLenderNamesSet.has(name.trim());
  }, [existingLenderNamesSet]);

  const handleAddLender = useCallback((name: string) => {
    if (isLenderAlreadyAdded(name)) return; // Prevent duplicates
    onAddLender(name);
    setSearchQuery('');
    setIsOpen(false);
  }, [onAddLender, isLenderAlreadyAdded]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (filteredLenderNames.length > 0 && !filteredLenderNames[0].isExisting) {
        handleAddLender(filteredLenderNames[0].name);
      } else if (!isLenderAlreadyAdded(searchQuery.trim())) {
        handleAddLender(searchQuery.trim());
      }
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [searchQuery, filteredLenderNames, handleAddLender, isLenderAlreadyAdded]);

  // Check if current search query matches an existing lender
  const isDuplicateQuery = useMemo(() => {
    return searchQuery.trim() && isLenderAlreadyAdded(searchQuery.trim());
  }, [searchQuery, isLenderAlreadyAdded]);

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
        <div className="w-56 ml-2">
          <Input
            placeholder="Type 2+ chars to search lenders..."
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
        className="w-[var(--radix-popover-trigger-width)] p-0 max-h-60 overflow-auto" 
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filteredLenderNames.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/30">
            {filteredLenderNames.length} match{filteredLenderNames.length !== 1 ? 'es' : ''} for "{searchQuery.trim()}"
          </div>
        )}
        {filteredLenderNames.map((item, idx) => (
          <button
            key={`${item.name}-${idx}`}
            className={`w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center justify-between ${
              item.isExisting 
                ? 'opacity-60 cursor-default' 
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
            onClick={() => !item.isExisting && handleAddLender(item.name)}
            disabled={item.isExisting}
          >
            <span>{highlightMatch(item.name)}</span>
            {item.isExisting && (
              <span className="text-xs text-muted-foreground italic ml-2 shrink-0">Added</span>
            )}
          </button>
        ))}
        {searchQuery.trim() && !isDuplicateQuery && (
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center gap-2 border-t border-border bg-muted/50"
            onClick={() => handleAddLender(searchQuery.trim())}
          >
            <Plus className="h-4 w-4 text-primary" />
            <span>
              Add <span className="font-medium text-primary">"{searchQuery.trim()}"</span> as new lender
            </span>
          </button>
        )}
        {isDuplicateQuery && (
          <div className="w-full px-3 py-2 text-sm text-muted-foreground border-t border-border bg-muted/50 italic">
            "{searchQuery.trim()}" is already added to this deal
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

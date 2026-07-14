import { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Info } from 'lucide-react';

interface LenderSearchInputProps {
  lenderNames: string[];
  existingLenderNames: string[];
  onAddLender: (name: string) => void;
  isLoadingLenders?: boolean;
  /**
   * Fires whenever the search query changes. Consumers use this to also
   * filter the visible funding-source list in the deal so typing narrows
   * both the dropdown AND the list of already-attached sources below.
   */
  onQueryChange?: (query: string) => void;
}

export function LenderSearchInput({ 
  lenderNames, 
  existingLenderNames, 
  onAddLender,
  isLoadingLenders = false,
  onQueryChange,
}: LenderSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Only show dropdown when there's meaningful text to filter (at least 2 chars)
  const shouldShowDropdown = searchQuery.trim().length >= 2;

  const existingLenderNamesSet = useMemo(() => new Set(existingLenderNames), [existingLenderNames]);

  // Filter lenders: ONLY include if name contains the search query (case-insensitive)
  const filteredLenderNames = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) return [];

    const queryLower = trimmedQuery.toLowerCase();
    const limit = 15;
    const matches: { name: string; score: number; coverage: number; isExisting: boolean }[] = [];

    for (const name of lenderNames) {
      const isExisting = existingLenderNamesSet.has(name);
      
      const nameLower = name.toLowerCase();
      const nameNoSpaces = nameLower.replace(/\s+/g, '');
      const queryNoSpaces = queryLower.replace(/\s+/g, '');
      
      if (!nameNoSpaces.includes(queryNoSpaces)) continue;

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

    matches.sort((a, b) => {
      // Prioritize funding sources ALREADY attached to this deal so the user
      // sees what's already here before being offered new adds.
      if (a.isExisting !== b.isExisting) return a.isExisting ? -1 : 1;
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

  const existingMatches = useMemo(
    () => filteredLenderNames.filter(m => m.isExisting),
    [filteredLenderNames],
  );
  const addableMatches = useMemo(
    () => filteredLenderNames.filter(m => !m.isExisting),
    [filteredLenderNames],
  );

  const isLenderAlreadyAdded = useCallback((name: string) => {
    return existingLenderNamesSet.has(name.trim());
  }, [existingLenderNamesSet]);

  const handleAddLender = useCallback((name: string) => {
    if (isLenderAlreadyAdded(name)) return;
    onAddLender(name);
    setSearchQuery('');
    onQueryChange?.('');
    setIsOpen(false);
  }, [onAddLender, isLenderAlreadyAdded, onQueryChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      // Enter adds the top addable (non-existing) match. If the only matches
      // are already attached to the deal, do nothing — the user is browsing.
      if (addableMatches.length > 0) {
        handleAddLender(addableMatches[0].name);
      }
      // Free-text creation is intentionally disabled: a funding source must
      // exist in the tenant's Funding Sources database before it can be
      // attached to a deal. Users add new sources from the Funding Sources page.
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [searchQuery, addableMatches, handleAddLender]);

  const isDuplicateQuery = useMemo(() => {
    return searchQuery.trim() && isLenderAlreadyAdded(searchQuery.trim());
  }, [searchQuery, isLenderAlreadyAdded]);

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

  const hasQuery = searchQuery.trim().length >= 2;
  const noResults = hasQuery && filteredLenderNames.length === 0 && !isDuplicateQuery;

  return (
    <Popover open={isOpen && shouldShowDropdown} onOpenChange={(open) => {
      if (!open) return;
      setIsOpen(open);
    }}>
      <PopoverTrigger asChild>
        <div className="relative w-full min-w-0">
          <Input
            placeholder="Type to Search..."
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value;
              setSearchQuery(next);
              onQueryChange?.(next);
              // Keep the dropdown closed while typing — the list below
              // filters live. The dropdown only opens when the user
              // explicitly requests it (Enter to add top match, or
              // future affordance).
              setIsOpen(false);
            }}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
          />
          {isLoadingLenders && hasQuery && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] p-0 max-h-60 overflow-auto" 
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {noResults && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {isLoadingLenders ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching lenders…
              </span>
            ) : (
              <div className="space-y-1.5">
                <div className="font-medium text-foreground">No funding source found</div>
                <div className="text-xs flex items-start gap-1.5 justify-center">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    Add it in the <span className="text-foreground">Funding Sources</span> page first,
                    then attach it here.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        {existingMatches.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
            In this deal ({existingMatches.length})
          </div>
        )}
        {existingMatches.map((item, idx) => (
          <button
            key={`existing-${item.name}-${idx}`}
            className="w-full text-left px-3 py-2 text-sm cursor-default opacity-70 flex items-center justify-between"
            disabled
          >
            <span>{highlightMatch(item.name)}</span>
            <span className="text-xs text-muted-foreground italic ml-2 shrink-0">Added</span>
          </button>
        ))}
        {addableMatches.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-t border-border bg-muted/30 flex items-center justify-between">
            <span>Add to deal ({addableMatches.length})</span>
            {isLoadingLenders && (
              <span className="inline-flex items-center gap-1 normal-case">
                <Loader2 className="h-3 w-3 animate-spin" />
                loading more…
              </span>
            )}
          </div>
        )}
        {addableMatches.map((item, idx) => (
          <button
            key={`add-${item.name}-${idx}`}
            className="w-full text-left px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
            onClick={() => handleAddLender(item.name)}
          >
            <span>{highlightMatch(item.name)}</span>
            <span className="text-[11px] text-muted-foreground ml-2 shrink-0">Click to add</span>
          </button>
        ))}
        {isDuplicateQuery && (
          <div className="w-full px-3 py-2 text-sm text-muted-foreground border-t border-border bg-muted/50 italic">
            "{searchQuery.trim()}" is already added to this deal
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

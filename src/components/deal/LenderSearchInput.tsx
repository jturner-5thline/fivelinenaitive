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

  // Only show dropdown when there's text to filter
  const shouldShowDropdown = searchQuery.trim().length > 0;

  const existingLenderNamesSet = useMemo(() => new Set(existingLenderNames), [existingLenderNames]);

  // Filter lenders: ONLY include if name contains the search query (case-insensitive)
  const filteredLenderNames = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return [];

    const queryLower = trimmedQuery.toLowerCase();
    const limit = 20;
    const matches: { name: string; score: number }[] = [];

    for (const name of lenderNames) {
      if (existingLenderNamesSet.has(name)) continue;
      
      const nameLower = name.toLowerCase();
      
      // STRICT: Only include if name actually contains the search text
      if (!nameLower.includes(queryLower)) continue;

      // Score: prefix match = 0, word-start match = 1, substring = 2
      let score: number;
      if (nameLower.startsWith(queryLower)) {
        score = 0; // Best: starts with query
      } else {
        // Check if any word starts with query
        const words = nameLower.split(/\s+/);
        const wordStartMatch = words.some(word => word.startsWith(queryLower));
        score = wordStartMatch ? 1 : 2;
      }

      matches.push({ name, score });
    }

    // Sort: best matches first, then shorter names, then alphabetically
    matches.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name);
    });

    return matches.slice(0, limit).map(m => m.name);
  }, [lenderNames, existingLenderNamesSet, searchQuery]);

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
        handleAddLender(searchQuery.trim());
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
        {searchQuery.trim() && (
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
      </PopoverContent>
    </Popover>
  );
}

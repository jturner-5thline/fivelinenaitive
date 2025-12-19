import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useReferralSources, ReferralSource } from '@/hooks/useReferralSources';

interface ReferralSourceInputProps {
  value?: ReferralSource | null;
  onChange: (referrer: ReferralSource | null) => void;
  className?: string;
}

export function ReferralSourceInput({ value, onChange, className }: ReferralSourceInputProps) {
  const { referralSources, isLoading, addReferralSource } = useReferralSources();
  const [inputValue, setInputValue] = useState(value?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter sources based on input
  const filteredSources = referralSources.filter(source =>
    source.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Check if the input is a new source
  const isNewSource = inputValue.trim() !== '' && 
    !referralSources.some(s => s.name.toLowerCase() === inputValue.toLowerCase().trim());

  // Update input when value prop changes
  useEffect(() => {
    setInputValue(value?.name || '');
  }, [value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowAddPrompt(false);
        // If no match found, reset to original value
        if (isNewSource && !showAddPrompt) {
          setInputValue(value?.name || '');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, isNewSource, showAddPrompt]);

  const handleSelect = useCallback((source: ReferralSource) => {
    setInputValue(source.name);
    onChange(source);
    setIsOpen(false);
    setShowAddPrompt(false);
  }, [onChange]);

  const handleAddNew = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    setIsAdding(true);
    const newSource = await addReferralSource(inputValue.trim());
    setIsAdding(false);
    
    if (newSource) {
      handleSelect(newSource);
    }
  }, [inputValue, addReferralSource, handleSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    
    // Show add prompt if this is a new name
    const matchesExisting = referralSources.some(
      s => s.name.toLowerCase() === newValue.toLowerCase().trim()
    );
    setShowAddPrompt(newValue.trim() !== '' && !matchesExisting);
  };

  const handleClear = () => {
    setInputValue('');
    onChange(null);
    setShowAddPrompt(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showAddPrompt && isNewSource) {
        handleAddNew();
      } else if (filteredSources.length === 1) {
        handleSelect(filteredSources[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setShowAddPrompt(false);
      setInputValue(value?.name || '');
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search or add referral source..."
          className="pr-8"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-auto"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {filteredSources.length > 0 && (
                <div className="py-1">
                  {filteredSources.map(source => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => handleSelect(source)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between",
                        value?.id === source.id && "bg-muted"
                      )}
                    >
                      <span>{source.name}</span>
                      {value?.id === source.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showAddPrompt && isNewSource && (
                <div className="border-t border-border p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-primary hover:text-primary"
                    onClick={handleAddNew}
                    disabled={isAdding}
                  >
                    {isAdding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add "{inputValue.trim()}" as new referral source
                  </Button>
                </div>
              )}

              {filteredSources.length === 0 && !showAddPrompt && inputValue && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No matching referral sources
                </div>
              )}

              {referralSources.length === 0 && !inputValue && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No referral sources yet. Start typing to add one.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

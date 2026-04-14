import { useState, useRef, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailContact } from '@/hooks/useEmailContacts';

interface RecipientFieldProps {
  label: string;
  recipients: string[];
  onChange: (recipients: string[]) => void;
  search: (query: string, exclude?: string[]) => EmailContact[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  onBlur?: () => void;
}

export function RecipientField({
  label,
  recipients,
  onChange,
  search,
  placeholder = 'Add recipient…',
  className,
  inputClassName,
  labelClassName,
  onBlur,
}: RecipientFieldProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<EmailContact[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length >= 1) {
      const results = search(query, recipients);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query, search, recipients]);

  const addRecipient = useCallback((email: string) => {
    const cleaned = email.toLowerCase().trim();
    if (!cleaned || recipients.includes(cleaned)) return;
    onChange([...recipients, cleaned]);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [recipients, onChange]);

  const removeRecipient = useCallback((email: string) => {
    onChange(recipients.filter(r => r !== email));
  }, [recipients, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        addRecipient(suggestions[highlightedIndex].email);
      } else if (query.includes('@') && query.includes('.')) {
        e.preventDefault();
        addRecipient(query);
      } else if (e.key === 'Tab') {
        return; // Allow normal tab
      }
    } else if (e.key === 'Backspace' && query === '' && recipients.length > 0) {
      removeRecipient(recipients[recipients.length - 1]);
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (query.trim()) addRecipient(query);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (query.trim() && query.includes('@')) {
        addRecipient(query);
      }
      setShowSuggestions(false);
      onBlur?.();
    }, 200);
  };

  return (
    <div className={cn('flex items-start gap-2 relative', className)}>
      <span className={cn('text-xs text-muted-foreground shrink-0 mt-1.5', labelClassName)}>
        {label}
      </span>
      <div
        ref={containerRef}
        className="flex-1 flex flex-wrap items-center gap-1 min-h-[28px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {recipients.map(email => (
          <Badge
            key={email}
            variant="secondary"
            className="text-[10px] gap-1 pr-0.5 py-0.5 h-5 max-w-[200px] shrink-0"
          >
            <span className="truncate">{email}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeRecipient(email); }}
              className="rounded-full hover:bg-muted p-0.5 shrink-0"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.length >= 1) setShowSuggestions(suggestions.length > 0); }}
          onBlur={handleBlur}
          placeholder={recipients.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 min-w-[120px] h-7 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50',
            inputClassName
          )}
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((contact, index) => (
            <button
              key={contact.email}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent transition-colors',
                index === highlightedIndex && 'bg-accent'
              )}
              onMouseDown={(e) => { e.preventDefault(); addRecipient(contact.email); }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                {(contact.name || contact.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {contact.name && (
                  <div className="text-xs font-medium truncate">{contact.name}</div>
                )}
                <div className="text-[11px] text-muted-foreground truncate">{contact.email}</div>
              </div>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {contact.frequency > 1 ? `${contact.frequency}×` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Helper: converts a comma-separated string to an array, or array to comma string.
 * Use these to bridge between old string-based state and new array-based RecipientField.
 */
export function emailStringToArray(str: string): string[] {
  if (!str.trim()) return [];
  return str.split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function emailArrayToString(arr: string[]): string {
  return arr.join(', ');
}

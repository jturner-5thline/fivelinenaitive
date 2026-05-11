import { useState, useRef, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmailContact } from '@/hooks/useEmailContacts';

/**
 * Pragmatic email validator: rejects whitespace, requires single '@',
 * a non-empty local part (max 64 chars), and a domain with a TLD of 2+ chars.
 * Keeps things permissive enough for real-world addresses (plus-aliases, etc.)
 * without trying to implement full RFC 5322.
 */
const EMAIL_REGEX = /^[A-Za-z0-9._%+\-!#$&'*/=?^`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at < 1) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64) return false;
  if (!domain.includes('.')) return false;
  return EMAIL_REGEX.test(v);
}

/**
 * Split a pasted recipient string into individual entries while respecting
 * quoted display names. Splits on commas, semicolons, and newlines that
 * appear OUTSIDE of double quotes and OUTSIDE of `<...>` brackets, so
 * inputs like:
 *   "Doe, Jane" <jane@x.com>, bob@y.com; "Smith, John" <john@z.com>
 * tokenize correctly.
 */
function splitRecipientList(raw: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  let inQuotes = false;
  let inAngle = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' && !inAngle) {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (ch === '<' && !inQuotes) { inAngle = true; buf += ch; continue; }
    if (ch === '>' && !inQuotes) { inAngle = false; buf += ch; continue; }
    const isSeparator = !inQuotes && !inAngle && (ch === ',' || ch === ';' || ch === '\n' || ch === '\r');
    if (isSeparator) {
      const t = buf.trim();
      if (t) tokens.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) tokens.push(tail);
  return tokens;
}

/**
 * Extract the bare email address from a single recipient token, supporting:
 *   - `email@example.com`
 *   - `Jane Doe <jane@example.com>`
 *   - `"Doe, Jane" <jane@example.com>`
 *   - `Jane Doe email@example.com` (whitespace-separated, last word wins)
 * Returns the original trimmed token unchanged if no email shape is found,
 * so the caller can surface it as the exact invalid string.
 */
export function extractEmailFromToken(token: string): { email: string; raw: string } {
  const raw = token.trim();
  // Prefer angle-bracketed form first
  const angle = raw.match(/<\s*([^<>\s]+)\s*>/);
  if (angle && angle[1]) return { email: angle[1].trim(), raw };
  // Otherwise pick the last whitespace-delimited piece that contains '@'
  const parts = raw.split(/\s+/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].includes('@')) return { email: parts[i].replace(/^[<("']+|[>)"']+$/g, ''), raw };
  }
  return { email: raw, raw };
}

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
  /** Optional callback for parent to react to validation state changes. */
  onValidityChange?: (isValid: boolean) => void;
  /** Explicit tab order index for keyboard navigation. */
  tabIndex?: number;
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
  onValidityChange,
  tabIndex,
}: RecipientFieldProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<EmailContact[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Notify parent of validity (any error present == invalid)
  useEffect(() => {
    onValidityChange?.(error === null);
  }, [error, onValidityChange]);

  const addRecipient = useCallback((input: string): boolean => {
    const trimmed = input.trim().replace(/[,;]+$/, '');
    if (!trimmed) return false;
    // Accept "Jane Doe <jane@x.com>" and similar formats by extracting the
    // bare address. The original token is preserved for error messaging
    // so the user sees exactly what they pasted/typed if it's invalid.
    const { email: extracted, raw } = extractEmailFromToken(trimmed);
    const cleaned = extracted.toLowerCase();
    if (!cleaned) return false;
    if (recipients.includes(cleaned)) {
      setError(`"${cleaned}" is already added`);
      return false;
    }
    if (!isValidEmail(cleaned)) {
      setError(`"${raw}" is not a valid email address`);
      return false;
    }
    onChange([...recipients, cleaned]);
    setQuery('');
    setError(null);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
    return true;
  }, [recipients, onChange]);

  const removeRecipient = useCallback((email: string) => {
    onChange(recipients.filter(r => r !== email));
    // Clear error if it referenced this address
    setError(prev => (prev && prev.includes(`"${email}"`) ? null : prev));
  }, [recipients, onChange]);

  /**
   * Commit several recipients at once (paste / comma-separated). Honors
   * quoted display names and angle-bracketed addresses, so each of these
   * yields a single valid recipient:
   *   "Doe, Jane" <jane@x.com>
   *   Bob Smith <bob@y.com>
   *   carol@z.com
   * Invalid entries are reported with their EXACT original text so the
   * user can see what failed (e.g. "Bob <not-an-email>").
   */
  const addMultiple = useCallback((rawInput: string): boolean => {
    const tokens = splitRecipientList(rawInput);
    if (tokens.length === 0) return false;

    const next = [...recipients];
    const invalid: string[] = [];
    let added = 0;
    for (const token of tokens) {
      const { email, raw } = extractEmailFromToken(token);
      const cleaned = email.toLowerCase();
      if (!cleaned) continue;
      if (next.includes(cleaned)) continue;
      if (!isValidEmail(cleaned)) {
        invalid.push(raw);
        continue;
      }
      next.push(cleaned);
      added += 1;
    }

    if (added > 0) onChange(next);

    if (invalid.length > 0) {
      setError(
        invalid.length === 1
          ? `"${invalid[0]}" is not a valid email address`
          : `${invalid.length} invalid: ${invalid.slice(0, 3).map(s => `"${s}"`).join(', ')}${invalid.length > 3 ? '…' : ''}`,
      );
    } else {
      setError(null);
    }
    setQuery('');
    setShowSuggestions(false);
    return added > 0 || invalid.length === 0;
  }, [recipients, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      // Always prevent Enter from bubbling to form/dialog submission while
      // composing a recipient — Enter in this field should ONLY confirm the
      // active suggestion (or commit the typed text), never trigger Send.
      e.preventDefault();
      e.stopPropagation();
      // Prefer the explicitly highlighted suggestion; otherwise fall back to
      // the first visible suggestion if the dropdown is open. This makes
      // Enter "just work" after the user starts typing without forcing them
      // to press ArrowDown first.
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        addRecipient(suggestions[highlightedIndex].email);
      } else if (showSuggestions && suggestions.length > 0) {
        addRecipient(suggestions[0].email);
      } else if (query.trim()) {
        addRecipient(query);
      }
    } else if (e.key === 'Tab') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        addRecipient(suggestions[highlightedIndex].email);
      } else if (query.trim()) {
        e.preventDefault();
        addRecipient(query);
      }
      // Otherwise allow normal tab navigation
    } else if (e.key === 'Backspace' && query === '' && recipients.length > 0) {
      removeRecipient(recipients[recipients.length - 1]);
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (query.trim()) addRecipient(query);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setError(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (text && /[,;\s]/.test(text)) {
      e.preventDefault();
      addMultiple(text);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    // Clear error as user types — they're correcting it
    if (error) setError(null);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (query.trim()) {
        addRecipient(query);
      }
      setShowSuggestions(false);
      onBlur?.();
    }, 200);
  };

  return (
    <div className={cn('flex flex-col gap-1 relative', className)}>
      <div className="flex items-start gap-2">
        <span className={cn('text-xs text-muted-foreground shrink-0 mt-1.5', labelClassName)}>
          {label}
        </span>
        <div
          ref={containerRef}
          className={cn(
            'flex-1 flex flex-wrap items-center gap-1 min-h-[28px] cursor-text rounded-sm transition-colors',
            error && 'ring-1 ring-destructive/40 px-1 -mx-1',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {recipients.map(email => {
            const valid = isValidEmail(email);
            return (
              <Badge
                key={email}
                variant={valid ? 'secondary' : 'destructive'}
                className={cn(
                  'text-[10px] gap-1 pr-0.5 py-0.5 h-5 max-w-[200px] shrink-0',
                  !valid && 'bg-destructive/15 text-destructive border-destructive/30',
                )}
              >
                {!valid && <AlertCircle className="h-2.5 w-2.5 shrink-0" />}
                <span className="truncate">{email}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeRecipient(email); }}
                  className="rounded-full hover:bg-muted p-0.5 shrink-0"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => { if (query.length >= 1) setShowSuggestions(suggestions.length > 0); }}
            onBlur={handleBlur}
            placeholder={recipients.length === 0 ? placeholder : ''}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${label.toLowerCase()}-recipient-error` : undefined}
            tabIndex={tabIndex}
            className={cn(
              'flex-1 min-w-[120px] h-7 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50',
              inputClassName
            )}
          />
        </div>
      </div>

      {/* Inline validation error */}
      {error && (
        <div
          id={`${label.toLowerCase()}-recipient-error`}
          role="alert"
          className="flex items-center gap-1 pl-12 text-[11px] text-destructive"
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-[calc(100%+2px)] z-50 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
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
  const tokens = splitRecipientList(str);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const { email } = extractEmailFromToken(token);
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function emailArrayToString(arr: string[]): string {
  return arr.join(', ');
}

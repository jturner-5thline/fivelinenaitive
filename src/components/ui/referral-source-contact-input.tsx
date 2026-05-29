import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface ReferralSourceContact {
  id: string;
  name?: string | null;
}

interface Props {
  value?: ReferralSourceContact | null;
  onChange: (contact: { id: string; name: string } | null) => void;
  className?: string;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
}

const formatName = (c: ContactRow): string =>
  (c.full_name && c.full_name.trim()) ||
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
  c.email ||
  'Unnamed contact';

export function ReferralSourceContactInput({ value, onChange, className }: Props) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [inputValue, setInputValue] = useState(value?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [resolvedName, setResolvedName] = useState<string | null>(value?.name || null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resolve a contact name when only an id was provided.
  useEffect(() => {
    let cancelled = false;
    if (!value?.id) {
      setResolvedName(null);
      return;
    }
    if (value.name) {
      setResolvedName(value.name);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email')
        .eq('id', value.id)
        .maybeSingle();
      if (cancelled) return;
      setResolvedName(data ? formatName(data as ContactRow) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [value?.id, value?.name]);

  // Keep local input in sync with external value when not editing
  useEffect(() => {
    if (!isEditing && !isOpen) setInputValue(resolvedName || '');
  }, [resolvedName, isEditing, isOpen]);

  // Search contacts (debounced)
  useEffect(() => {
    if (!isOpen || !company?.id) return;
    let cancelled = false;
    const q = inputValue.trim();
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        let query = supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email')
          .eq('org_company_id', company.id)
          .order('full_name', { ascending: true })
          .limit(15);
        if (q.length > 0) query = query.ilike('full_name', `%${q}%`);
        const { data, error: err } = await query;
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setResults([]);
        } else {
          setResults((data || []) as ContactRow[]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to search contacts');
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [inputValue, isOpen, company?.id]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsEditing(false);
        setInputValue(resolvedName || '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [resolvedName]);

  const trimmed = inputValue.trim();
  const hasExactMatch = results.some(
    (r) => formatName(r).toLowerCase() === trimmed.toLowerCase()
  );
  const showCreate = trimmed.length > 0 && !hasExactMatch && !loading;

  const handleSelect = useCallback(
    (c: ContactRow) => {
      const name = formatName(c);
      setInputValue(name);
      setIsEditing(false);
      setIsOpen(false);
      onChange({ id: c.id, name });
    },
    [onChange]
  );

  const handleCreate = useCallback(async () => {
    if (!trimmed || !company?.id) return;
    setCreating(true);
    try {
      const space = trimmed.indexOf(' ');
      const first_name = space > 0 ? trimmed.slice(0, space) : trimmed;
      const last_name = space > 0 ? trimmed.slice(space + 1) : null;
      const { data, error: err } = await supabase
        .from('contacts')
        .insert({
          first_name,
          last_name,
          org_company_id: company.id,
          created_by: user?.id,
          lifecycle_stage: 'lead',
          status: 'new',
          source_system: 'referral_source_inline',
        } as any)
        .select('id, first_name, last_name, full_name, email')
        .single();
      if (err) throw err;
      handleSelect(data as ContactRow);
      toast({ title: 'Contact created', description: `"${trimmed}" added as referral source.` });
    } catch (e: any) {
      toast({
        title: 'Could not create contact',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }, [trimmed, company?.id, user?.id, handleSelect]);

  const handleClear = () => {
    setInputValue('');
    setIsEditing(false);
    onChange(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = results.length + (showCreate ? 1 : 0);
      if (max > 0) setHighlight((h) => (h + 1) % max);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const max = results.length + (showCreate ? 1 : 0);
      if (max > 0) setHighlight((h) => (h - 1 + max) % max);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < results.length) {
        const c = results[highlight];
        if (c) handleSelect(c);
      } else if (showCreate) {
        handleCreate();
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsEditing(false);
      setInputValue(resolvedName || '');
    }
  };

  useEffect(() => setHighlight(0), [inputValue, isOpen]);

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsEditing(true);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setIsEditing(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search contacts…"
          className="pr-8"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear referral source"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-auto"
        >
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="px-3 py-4 text-sm text-destructive text-center">{error}</div>
          ) : (
            <>
              {results.length > 0 && (
                <div className="py-1">
                  {results.map((c, idx) => {
                    const name = formatName(c);
                    const isHi = idx === highlight;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={value?.id === c.id}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => handleSelect(c)}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                          isHi ? 'bg-muted' : 'hover:bg-muted/60',
                          value?.id === c.id && 'font-medium'
                        )}
                      >
                        <span className="truncate">
                          {name}
                          {c.email && (
                            <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>
                          )}
                        </span>
                        {value?.id === c.id && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {showCreate && (
                <div className="border-t border-border p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'w-full justify-start gap-2 text-primary hover:text-primary',
                      highlight === results.length && 'bg-muted'
                    )}
                    onMouseEnter={() => setHighlight(results.length)}
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create contact "{trimmed}"
                  </Button>
                </div>
              )}

              {!loading && results.length === 0 && !showCreate && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {trimmed ? 'No matching contacts' : 'Start typing to search contacts'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
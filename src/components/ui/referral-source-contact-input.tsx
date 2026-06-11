import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useReferralSources } from '@/hooks/useReferralSources';

export interface ReferralSourceContact {
  id: string;
  name?: string | null;
}

export type ReferralSelection =
  | { kind: 'contact'; id: string; name: string; email?: string | null }
  | { kind: 'referral_source'; id: string; name: string; email?: string | null };

interface Props {
  value?: ReferralSourceContact | null;
  onChange: (selection: ReferralSelection | null) => void;
  className?: string;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
}

interface RefSourceRow {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

const formatName = (c: ContactRow): string =>
  (c.full_name && c.full_name.trim()) ||
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
  c.email ||
  'Unnamed contact';

export function ReferralSourceContactInput({ value, onChange, className }: Props) {
  const { company } = useCompany();
  const { user } = useAuth();
  const { addReferralSource } = useReferralSources();
  const [inputValue, setInputValue] = useState(value?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<ContactRow[]>([]);
  const [refSources, setRefSources] = useState<RefSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingRs, setCreatingRs] = useState(false);
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
    const escaped = q.replace(/[\\%_,()]/g, (m) => '\\' + m);
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        let contactsQuery = supabase
          .from('contacts')
          .select('id, first_name, last_name, full_name, email')
          .eq('org_company_id', company.id)
          .order('full_name', { ascending: true })
          .limit(15);
        if (q.length > 0) {
          const pat = `%${escaped}%`;
          contactsQuery = contactsQuery.or(
            `full_name.ilike.${pat},first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat}`,
          );
        }
        let rsQuery = supabase
          .from('referral_sources')
          .select('id, name, email, company, company_id')
          .or(`company_id.eq.${company.id},company_id.is.null`)
          .order('name', { ascending: true })
          .limit(10);
        if (q.length > 0) {
          const pat = `%${escaped}%`;
          rsQuery = rsQuery.or(`name.ilike.${pat},email.ilike.${pat}`);
        }
        const [contactsRes, rsRes] = await Promise.all([contactsQuery, rsQuery]);
        if (cancelled) return;
        if (contactsRes.error) {
          setError(contactsRes.error.message);
          setResults([]);
        } else {
          setResults((contactsRes.data || []) as ContactRow[]);
        }
        if (!rsRes.error) {
          setRefSources((rsRes.data || []) as RefSourceRow[]);
        } else {
          setRefSources([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to search contacts');
          setResults([]);
          setRefSources([]);
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
  ) || refSources.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !hasExactMatch && !loading;
  const showCreateRs = showCreate;
  // action indexes (after contacts + ref sources)
  const createContactIdx = results.length + refSources.length;
  const createRsIdx = createContactIdx + 1;
  const totalRows = createContactIdx + (showCreate ? 1 : 0) + (showCreateRs ? 1 : 0);

  const handleSelect = useCallback(
    (c: ContactRow) => {
      const name = formatName(c);
      setInputValue(name);
      setIsEditing(false);
      setIsOpen(false);
      onChange({ kind: 'contact', id: c.id, name, email: c.email });
    },
    [onChange]
  );

  const handleSelectRs = useCallback(
    (r: RefSourceRow) => {
      setInputValue(r.name);
      setIsEditing(false);
      setIsOpen(false);
      onChange({ kind: 'referral_source', id: r.id, name: r.name, email: r.email });
    },
    [onChange],
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

  const handleCreateRs = useCallback(async () => {
    if (!trimmed) return;
    setCreatingRs(true);
    try {
      const created = await addReferralSource(trimmed);
      if (created) {
        handleSelectRs({ id: created.id, name: created.name, email: created.email ?? null, company: created.company ?? null });
      }
    } finally {
      setCreatingRs(false);
    }
  }, [trimmed, addReferralSource, handleSelectRs]);

  const handleClear = () => {
    setInputValue('');
    setIsEditing(false);
    onChange(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalRows > 0) setHighlight((h) => (h + 1) % totalRows);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalRows > 0) setHighlight((h) => (h - 1 + totalRows) % totalRows);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < results.length) {
        const c = results[highlight];
        if (c) handleSelect(c);
      } else if (highlight < results.length + refSources.length) {
        const r = refSources[highlight - results.length];
        if (r) handleSelectRs(r);
      } else if (showCreate && highlight === createContactIdx) {
        handleCreate();
      } else if (showCreateRs && highlight === createRsIdx) {
        handleCreateRs();
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
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Contacts
                  </div>
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

              {refSources.length > 0 && (
                <div className="py-1 border-t border-border/60">
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Referral sources
                  </div>
                  {refSources.map((r, i) => {
                    const idx = results.length + i;
                    const isHi = idx === highlight;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={value?.id === r.id}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => handleSelectRs(r)}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                          isHi ? 'bg-muted' : 'hover:bg-muted/60',
                          value?.id === r.id && 'font-medium',
                        )}
                      >
                        <span className="truncate">
                          {r.name}
                          {(r.email || r.company) && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.email || r.company}
                            </span>
                          )}
                        </span>
                        {value?.id === r.id && <Check className="h-4 w-4 text-primary" />}
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
                      highlight === createContactIdx && 'bg-muted'
                    )}
                    onMouseEnter={() => setHighlight(createContactIdx)}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'w-full justify-start gap-2 text-primary hover:text-primary',
                      highlight === createRsIdx && 'bg-muted',
                    )}
                    onMouseEnter={() => setHighlight(createRsIdx)}
                    onClick={handleCreateRs}
                    disabled={creatingRs}
                  >
                    {creatingRs ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Use "{trimmed}" as referral source
                  </Button>
                </div>
              )}

              {!loading && results.length === 0 && refSources.length === 0 && !showCreate && (
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
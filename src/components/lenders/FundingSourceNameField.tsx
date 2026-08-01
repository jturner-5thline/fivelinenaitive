import { useEffect, useRef, useState } from 'react';
import { Building2, Check, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { normalizeCompanyName } from '@/lib/funding-sources/companyMatch';
import { diceCoefficient } from '@/utils/stringSimilarity';

export interface LinkedCrmCompany {
  id: string;
  name: string;
  domain?: string | null;
  website_url?: string | null;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  linkedCompany: LinkedCrmCompany | null;
  onLinkCompany: (company: LinkedCrmCompany | null) => void;
  id?: string;
  placeholder?: string;
}

/**
 * Funding source name input with live company typeahead. Every funding source
 * should map to a company in the companies database — pick an existing one, or
 * the typed name will be used to create a new company on save.
 */
export function FundingSourceNameField({
  value,
  onChange,
  linkedCompany,
  onLinkCompany,
  id = 'name',
  placeholder = 'Enter funding source name',
}: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LinkedCrmCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const term = value.trim();
    if (!open || term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const norm = normalizeCompanyName(term);
      const token = norm.split(' ')[0] || term;
      const { data } = await supabase
        .from('crm_companies')
        .select('id,name,domain,website_url')
        .or(`name.ilike.%${term}%,name.ilike.%${token}%`)
        .limit(30);
      if (cancelled) return;
      const rows = (data ?? []) as LinkedCrmCompany[];
      rows.sort(
        (a, b) =>
          diceCoefficient(norm, normalizeCompanyName(b.name)) -
          diceCoefficient(norm, normalizeCompanyName(a.name)),
      );
      setResults(rows.slice(0, 8));
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, open]);

  const exactExists = results.some(
    (r) => r.name.trim().toLowerCase() === value.trim().toLowerCase(),
  );

  const select = (c: LinkedCrmCompany) => {
    onChange(c.name);
    onLinkCompany(c);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          if (linkedCompany && e.target.value.trim() !== linkedCompany.name.trim()) {
            onLinkCompany(null);
          }
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />

      {linkedCompany ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Building2 className="h-3 w-3 text-primary" />
          <span>
            Linked to company <span className="text-foreground">{linkedCompany.name}</span>
          </span>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
            aria-label="Unlink company"
            onClick={() => onLinkCompany(null)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : value.trim().length >= 2 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          No company linked — “{value.trim()}” will be created in Companies.
        </p>
      ) : null}

      {open && value.trim().length >= 2 && (
        <div
          className="app-dropdown-surface app-dropdown-surface app-dropdown-surface absolute z-50 mt-1 w-full rounded-md border border-border shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#060b18',
            backgroundImage:
              'linear-gradient(135deg, #0a1224 0%, #060b18 52%, #04060f 100%)',
            backdropFilter: 'none',
            opacity: 1,
          }}
        >
          <div className="max-h-64 overflow-y-auto py-1 bg-transparent">
            {loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Searching companies…</p>
            )}
            {!loading && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matching companies</p>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{c.name}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {c.domain || c.website_url || 'No domain on file'}
                  </span>
                </span>
                {linkedCompany?.id === c.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
            {!exactExists && (
              <button
                type="button"
                onClick={() => {
                  onLinkCompany(null);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border-t border-border/60 hover:bg-muted/60"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">
                  Create new company “{value.trim()}”
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Plus, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export interface PickedContact {
  contact_id: string | null; // null when user is typing a brand-new contact
  name: string;
  title: string;
  email: string;
  phone: string;
}

interface CrmContactRow {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  phone_work: string | null;
  phone_mobile: string | null;
}

interface Props {
  value: PickedContact;
  onChange: (next: PickedContact) => void;
}

/**
 * Combobox that searches the CRM contacts table by name/email, lets the user
 * pick an existing contact (auto-filling Name/Title/Email/Phone and linking
 * by contact_id) or fall back to typing a fresh contact inline.
 */
export function LenderContactPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<CrmContactRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = debounced.trim();
        let req = supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email, job_title, phone_work, phone_mobile')
          .order('full_name', { ascending: true })
          .limit(2000);
        if (q) {
          const safe = q.replace(/[%,]/g, ' ').trim();
          req = req.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
        }
        const { data, error } = await req;
        if (cancelled) return;
        if (error) {
          console.warn('[LenderContactPicker] search failed', error);
          setResults([]);
        } else {
          setResults((data ?? []) as CrmContactRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debounced, open]);

  const pickExisting = (c: CrmContactRow) => {
    onChange({
      contact_id: c.id,
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim(),
      title: c.job_title || '',
      email: c.email || '',
      phone: c.phone_work || c.phone_mobile || '',
    });
    setOpen(false);
    setQuery('');
  };

  const startNew = () => {
    onChange({
      contact_id: null,
      name: query.trim(),
      title: '',
      email: '',
      phone: '',
    });
    setOpen(false);
    setQuery('');
  };

  const clearLink = () => {
    onChange({ ...value, contact_id: null });
  };

  const linkedBadge = value.contact_id ? (
    <button
      type="button"
      onClick={clearLink}
      className="text-[10px] uppercase tracking-wide text-primary hover:underline"
      title="Unlink from CRM contact and edit freely"
    >
      Linked · unlink
    </button>
  ) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-8 flex-1 justify-between text-sm font-normal"
            >
              <span className={cn('truncate', !value.name && 'text-muted-foreground')}>
                {value.name || 'Search CRM contacts or type new…'}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search by name or email…"
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-[60vh]">
                {loading && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                )}
                {!loading && results.length === 0 && (
                  <CommandEmpty>No matching contacts.</CommandEmpty>
                )}
                {results.length > 0 && (
                  <CommandGroup heading="CRM Contacts">
                    {results.map((c) => {
                      const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(no name)';
                      return (
                        <CommandItem key={c.id} value={c.id} onSelect={() => pickExisting(c)}>
                          <div className="flex w-full items-center gap-2 min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                              {name.slice(0, 1)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm">{name}</div>
                              {c.email && (
                                <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                              )}
                            </div>
                            {value.contact_id === c.id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__create__" onSelect={startNew}>
                    <UserPlus className="mr-2 h-3.5 w-3.5" />
                    {query.trim()
                      ? <>Create new contact “{query.trim()}”</>
                      : <>Create new contact</>}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {linkedBadge}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value, contact_id: value.contact_id })}
          className="h-8 text-sm"
        />
        <Input
          placeholder="Title (e.g., VP)"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Email"
          type="email"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          className="h-8 text-sm"
        />
        <Input
          placeholder="Phone (optional)"
          value={value.phone}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}
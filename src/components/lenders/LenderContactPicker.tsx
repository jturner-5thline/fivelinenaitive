import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Mail, MapPin, Phone, Pencil, UserPlus } from 'lucide-react';
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
import { useCreateContact } from '@/hooks/useContacts';
import { toast } from '@/hooks/use-toast';
import { LOCATION_OPTIONS } from '@/constants/locations';
import { cn } from '@/lib/utils';

export interface PickedContact {
  contact_id: string | null;
  name: string;
  title: string;
  email: string;
  phone: string;
  geography?: string;
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
 * Funding-source contact picker — strictly tied to the CRM contacts table.
 * Users must either select an existing contact or create a new one (which
 * is written to the CRM contacts page). No free-text contact entry.
 */
export function LenderContactPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const [results, setResults] = useState<CrmContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    job_title: '',
    phone_work: '',
    geography: '',
  });
  const [geographyOpen, setGeographyOpen] = useState(false);
  const [geographySearch, setGeographySearch] = useState('');
  const filteredLocations = useMemo(() => {
    if (!geographySearch) return LOCATION_OPTIONS;
    const s = geographySearch.toLowerCase();
    return LOCATION_OPTIONS.filter((loc) => loc.toLowerCase().includes(s));
  }, [geographySearch]);

  const GeographySelect = ({ current, onPick }: { current: string; onPick: (v: string) => void }) => (
    <Popover open={geographyOpen} onOpenChange={setGeographyOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={geographyOpen}
          className="h-8 w-full justify-between text-sm font-normal"
        >
          <span className={cn('flex items-center gap-1.5 truncate', !current && 'text-muted-foreground')}>
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {current || 'Select geography'}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Search locations..."
            value={geographySearch}
            onChange={(e) => setGeographySearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
          {current && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm text-muted-foreground hover:bg-accent"
              onClick={() => { onPick(''); setGeographyOpen(false); setGeographySearch(''); }}
            >
              Clear selection
            </div>
          )}
          {filteredLocations.length === 0 ? (
            <div className="py-2 px-3 text-sm text-muted-foreground">No locations found</div>
          ) : (
            filteredLocations.map((option) => (
              <div
                key={option}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm hover:bg-accent',
                  current === option && 'bg-accent',
                )}
                onClick={() => { onPick(option); setGeographyOpen(false); setGeographySearch(''); }}
              >
                <Check className={cn('h-4 w-4', current === option ? 'opacity-100' : 'opacity-0')} />
                {option}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
  const createContact = useCreateContact();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = debounced.trim();
        // Empty query → show the first 50 contacts alphabetically.
        // With a query → server-side search across ALL contacts, capped at 50 matches.
        let req = supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email, job_title, phone_work, phone_mobile')
          .order('full_name', { ascending: true })
          .limit(50);
        if (q) {
          const safe = q.replace(/[%,]/g, ' ').trim();
          req = req.or(
            `full_name.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`,
          );
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
      geography: value.geography ?? '',
    });
    setOpen(false);
    setQuery('');
    setCreating(false);
  };

  const startNew = () => {
    const parts = query.trim().split(/\s+/);
    setNewForm({
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      email: '',
      job_title: '',
      phone_work: '',
      geography: '',
    });
    setOpen(false);
    setCreating(true);
  };

  const submitNew = async () => {
    const { first_name, last_name, email, job_title, phone_work, geography } = newForm;
    if (!first_name.trim() && !last_name.trim() && !email.trim()) {
      toast({ title: 'Add a name or email to create a contact', variant: 'destructive' });
      return;
    }
    try {
      const created: any = await createContact.mutateAsync({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim(),
        job_title: job_title.trim(),
        phone_work: phone_work.trim(),
      } as any);
      const fullName =
        created?.full_name ||
        [created?.first_name, created?.last_name].filter(Boolean).join(' ').trim() ||
        `${first_name} ${last_name}`.trim();
      onChange({
        contact_id: created?.id ?? null,
        name: fullName,
        title: created?.job_title || job_title.trim(),
        email: created?.email || email.trim(),
        phone: created?.phone_work || phone_work.trim(),
        geography: geography.trim(),
      });
      setCreating(false);
      setNewForm({ first_name: '', last_name: '', email: '', job_title: '', phone_work: '', geography: '' });
      toast({ title: 'Contact created' });
    } catch (err: any) {
      toast({ title: 'Could not create contact', description: err?.message, variant: 'destructive' });
    }
  };

  const clearSelection = () => {
    onChange({ contact_id: null, name: '', title: '', email: '', phone: '', geography: '' });
  };

  // Selected contact summary (read-only)
  if ((value.contact_id || value.name.trim() || value.email.trim()) && !creating) {
    return (
      <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{value.name || '(no name)'}</div>
            {value.title && (
              <div className="truncate text-xs text-muted-foreground">{value.title}</div>
            )}
            <div className="mt-1 space-y-0.5">
              {value.email && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> <span className="truncate">{value.email}</span>
                </div>
              )}
              {value.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" /> <span className="truncate">{value.phone}</span>
                </div>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={clearSelection}
          >
            <Pencil className="h-3 w-3 mr-1" /> Change
          </Button>
        </div>
        <div className="pt-1">
          <GeographySelect
            current={value.geography ?? ''}
            onPick={(v) => onChange({ ...value, geography: v })}
          />
        </div>
      </div>
    );
  }

  // Inline new-contact form
  if (creating) {
    return (
      <div className="space-y-2 rounded-md border border-border/60 p-2.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">New CRM contact</div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="First name"
            value={newForm.first_name}
            onChange={(e) => setNewForm({ ...newForm, first_name: e.target.value })}
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            placeholder="Last name"
            value={newForm.last_name}
            onChange={(e) => setNewForm({ ...newForm, last_name: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <Input
          placeholder="Email"
          type="email"
          value={newForm.email}
          onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
          className="h-8 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Title (e.g., VP)"
            value={newForm.job_title}
            onChange={(e) => setNewForm({ ...newForm, job_title: e.target.value })}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Phone (optional)"
            value={newForm.phone_work}
            onChange={(e) => setNewForm({ ...newForm, phone_work: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <GeographySelect
          current={newForm.geography}
          onPick={(v) => setNewForm({ ...newForm, geography: v })}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCreating(false)}
            disabled={createContact.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={submitNew}
            disabled={createContact.isPending}
          >
            {createContact.isPending ? 'Creating…' : 'Create & select'}
          </Button>
        </div>
      </div>
    );
  }

  // Empty state: search combobox
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-sm font-normal"
        >
          <span className="truncate text-muted-foreground">Search CRM contacts…</span>
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
            <CommandGroup>
              <CommandItem value="__create__" onSelect={startNew}>
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                {query.trim() ? <>Create new contact “{query.trim()}”</> : <>Create new contact</>}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
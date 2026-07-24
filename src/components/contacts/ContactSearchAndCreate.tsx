import { useEffect, useState } from 'react';
import { Check, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useCreateContact } from '@/hooks/useContacts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PickedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
}

export const formatPickedContactName = (c: PickedContact): string => {
  const composed = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  const full = (c.full_name || '').trim();
  if (full && full.toLowerCase() !== (c.email || '').toLowerCase()) return full;
  return c.email || 'Unnamed contact';
};

interface Props {
  open: boolean;
  onSelect: (c: PickedContact) => void;
  selectedName?: string | null;
  autoFocus?: boolean;
}

export function ContactSearchAndCreate({ open, onSelect, selectedName, autoFocus }: Props) {
  const { company } = useCompany();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const createContact = useCreateContact();
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebounced('');
      setShowCreate(false);
      setNewFirst('');
      setNewLast('');
      setNewEmail('');
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results = [], isFetching } = useQuery<PickedContact[]>({
    queryKey: ['contact-search-and-create', company?.id, debounced.toLowerCase()],
    enabled: open && !!company?.id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = debounced;
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email')
        .eq('org_company_id', company!.id)
        .limit(10);
      if (q.length > 0) {
        const escaped = q.replace(/[\\%_,()]/g, (m) => '\\' + m);
        const pat = `%${escaped}%`;
        // Search only full_name + email — narrower OR is much faster than
        // fanning across first/last/full/email on a large contacts table.
        query = query.or(`full_name.ilike.${pat},email.ilike.${pat}`);
      } else {
        query = query.order('full_name', { ascending: true });
      }
      const { data } = await query;
      return (data || []) as PickedContact[];
    },
  });
  const loading = isFetching && results.length === 0;

  const openCreate = () => {
    const q = search.trim();
    if (q.includes('@')) {
      setNewEmail(q);
      setNewFirst('');
      setNewLast('');
    } else if (q) {
      const parts = q.split(/\s+/);
      setNewFirst(parts[0] || '');
      setNewLast(parts.slice(1).join(' '));
      setNewEmail('');
    }
    setShowCreate(true);
  };

  const handleCreate = async () => {
    const first = newFirst.trim();
    const last = newLast.trim();
    const email = newEmail.trim();
    if (!first && !last && !email) {
      toast.error('Enter a name or email');
      return;
    }
    try {
      const created = await createContact.mutateAsync({
        first_name: first || null,
        last_name: last || null,
        email: email || null,
      } as never);
      onSelect({
        id: (created as { id: string }).id,
        first_name: first || null,
        last_name: last || null,
        full_name: [first, last].filter(Boolean).join(' ').trim() || null,
        email: email || null,
      });
      setShowCreate(false);
    } catch {
      // toast handled by hook
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="pl-7 h-8 text-sm"
        />
      </div>
      {(loading || results.length > 0 || search.trim().length > 0) && (
        <div className="max-h-44 overflow-auto rounded-md border border-border bg-popover">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center space-y-2">
              <div>No matching contacts</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={openCreate}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Create new contact{search.trim() ? ` “${search.trim()}”` : ''}
              </Button>
            </div>
          ) : (
            results.map((c) => {
              const name = formatPickedContactName(c);
              const hasRealName = name && name !== c.email;
              const selected = (selectedName || '').trim().toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-muted/60',
                    selected && 'bg-muted font-medium',
                  )}
                >
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate text-foreground">
                      {hasRealName ? name : (c.email || 'Unnamed contact')}
                    </span>
                    {hasRealName && c.email && (
                      <span className="truncate text-[11px] text-muted-foreground">{c.email}</span>
                    )}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
      {results.length > 0 && !showCreate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start text-xs text-muted-foreground hover:text-foreground"
          onClick={openCreate}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create new contact
        </Button>
      )}
      {showCreate && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[11px] font-medium text-muted-foreground">New contact</div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
              placeholder="First name"
              className="h-8 text-sm"
            />
            <Input
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
              placeholder="Last name"
              className="h-8 text-sm"
            />
          </div>
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="h-8 text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowCreate(false)}
              disabled={createContact.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreate}
              disabled={createContact.isPending}
            >
              {createContact.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Save contact'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Building2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ContactSearchAndCreate,
  formatPickedContactName,
  type PickedContact,
} from '@/components/contacts/ContactSearchAndCreate';

interface AffiliatedRow {
  id: string;
  name: string;
  email: string | null;
  companyName: string | null;
}

interface Props {
  dealId: string;
}

export function DealAffiliatedContactsField({ dealId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ['deal-affiliated-contacts', dealId],
    enabled: !!dealId,
    staleTime: 30_000,
    queryFn: async (): Promise<AffiliatedRow[]> => {
      const { data: links, error } = await supabase
        .from('contact_deals')
        .select('contact_id, role, created_at')
        .eq('deal_id', dealId)
        .eq('role', 'affiliated')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const ids = (links || []).map((l: any) => l.contact_id);
      if (!ids.length) return [];
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, org_company_id')
        .in('id', ids);
      const companyIds = Array.from(
        new Set((contacts || []).map((c: any) => c.org_company_id).filter(Boolean))
      );
      let companiesById = new Map<string, string>();
      if (companyIds.length) {
        const { data: companies } = await supabase
          .from('crm_companies')
          .select('id, name')
          .in('id', companyIds);
        companiesById = new Map((companies || []).map((c: any) => [c.id, c.name]));
      }
      return (contacts || []).map((c: any) => ({
        id: c.id,
        name: formatPickedContactName(c),
        email: c.email ?? null,
        companyName: c.org_company_id ? companiesById.get(c.org_company_id) ?? null : null,
      }));
    },
  });

  const addMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { data: existing } = await supabase
        .from('contact_deals')
        .select('contact_id')
        .eq('deal_id', dealId)
        .eq('contact_id', contactId)
        .maybeSingle();
      if (existing) {
        // Ensure the role is 'affiliated' if it wasn't already tagged.
        await supabase
          .from('contact_deals')
          .update({ role: 'affiliated' } as any)
          .eq('deal_id', dealId)
          .eq('contact_id', contactId)
          .is('role', null);
        return { skipped: true };
      }
      const { error } = await supabase
        .from('contact_deals')
        .insert({ deal_id: dealId, contact_id: contactId, role: 'affiliated' } as any);
      if (error) throw error;
      return { skipped: false };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-affiliated-contacts', dealId] });
      toast.success('Affiliated contact added');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to add contact'),
  });

  const removeMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('contact_deals')
        .delete()
        .eq('deal_id', dealId)
        .eq('contact_id', contactId)
        .eq('role', 'affiliated');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-affiliated-contacts', dealId] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove contact'),
  });

  const handleSelect = (c: PickedContact) => {
    setOpen(false);
    addMutation.mutate(c.id);
  };

  return (
    <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-start md:gap-2">
      <span className="text-muted-foreground text-sm md:pt-1">Affiliated Contacts</span>
      <div className="min-h-8 rounded-md border border-input bg-background px-2 py-1 flex flex-wrap items-center gap-1.5">
        {rows.map((r) => (
          <Badge
            key={r.id}
            variant="secondary"
            className="h-6 pl-2 pr-1 gap-1 text-xs font-normal max-w-full"
          >
            <span className="truncate">{r.name}</span>
            {r.companyName && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground truncate">
                <Building2 className="h-3 w-3" />
                <span className="truncate max-w-[140px]">{r.companyName}</span>
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${r.name}`}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20"
              onClick={() => removeMutation.mutate(r.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1 font-normal text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {rows.length === 0 ? 'Add contact' : 'Add'}
            </Button>
          </DialogTrigger>
          <DialogContent
            className="p-0 gap-0 overflow-hidden flex flex-col"
            style={{ width: 'min(92vw, 600px)', maxWidth: 'min(92vw, 600px)', maxHeight: '85vh' }}
          >
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10 shrink-0">
              <DialogTitle>Add affiliated contact</DialogTitle>
              <DialogDescription className="text-[12px]">
                Link a contact from your database. Their company will be tagged to this deal.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <ContactSearchAndCreate open={open} onSelect={handleSelect} autoFocus />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
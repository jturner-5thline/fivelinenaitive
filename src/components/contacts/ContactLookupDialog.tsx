import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserX, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { ContactDetailContent } from '@/components/crm/ContactDetailContent';

interface Props {
  /** Name to look up in the contacts DB. */
  name: string | null;
  /** Optional email hint for a more precise match. */
  email?: string | null;
  onClose: () => void;
}

/**
 * Looks up a contact in the CRM contacts table by name (or email) and, if
 * found, renders their full contact detail page inside a modal. If not
 * found, shows a "No Contact Found" empty state.
 */
export function ContactLookupDialog({ name, email, onClose }: Props) {
  const { company } = useCompany();
  const trimmed = (name || '').trim();

  const { data: contactId, isLoading } = useQuery({
    queryKey: ['contact_lookup_by_name', company?.id, trimmed.toLowerCase(), (email || '').toLowerCase()],
    enabled: !!company?.id && !!trimmed,
    queryFn: async () => {
      const escape = (s: string) => s.replace(/[\\%_,]/g, (m) => '\\' + m);

      // Prefer an email match when supplied.
      if (email && email.trim()) {
        const { data, error } = await supabase
          .from('contacts')
          .select('id')
          .eq('org_company_id', company!.id)
          .ilike('email', escape(email.trim()))
          .limit(1);
        if (error) throw error;
        if (data && data.length) return data[0].id as string;
      }

      // Exact name match first, then fuzzy.
      const exact = await supabase
        .from('contacts')
        .select('id')
        .eq('org_company_id', company!.id)
        .ilike('full_name', escape(trimmed))
        .limit(1);
      if (exact.error) throw exact.error;
      if (exact.data && exact.data.length) return exact.data[0].id as string;

      const fuzzy = await supabase
        .from('contacts')
        .select('id')
        .eq('org_company_id', company!.id)
        .ilike('full_name', `%${escape(trimmed)}%`)
        .limit(1);
      if (fuzzy.error) throw fuzzy.error;
      return (fuzzy.data && fuzzy.data.length ? fuzzy.data[0].id : null) as string | null;
    },
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[95vw] w-[1200px] max-h-[92vh] p-0 overflow-hidden"
        overlayClassName="bg-black/60 backdrop-blur-sm"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Looking up contact…
          </div>
        ) : contactId ? (
          <ScrollArea className="max-h-[92vh] p-6">
            <ContactDetailContent contactId={contactId} hideBackButton onDeleted={onClose} />
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
              <UserX className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No Contact Found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {trimmed ? <>No CRM contact matches <span className="font-medium">"{trimmed}"</span>.</> : 'This item is not linked to a CRM contact.'}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
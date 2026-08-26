import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Sprout, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import {
  REFERRAL_SOURCE_TAG,
  hasReferralSourceTag,
  ensureReferralSourceForContact,
} from '@/lib/ensureReferralSource';
import { splitContactTypes } from '@/components/contacts/ContactTypeMultiSelect';

interface AddToNurturingButtonProps {
  contact: any;
}

function contactDisplayName(contact: any): string {
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim();
  return (contact?.full_name || name || contact?.email || '').trim();
}

/**
 * Shown on an existing contact record when they are not yet tracked as a
 * referral source. Tags the contact "Referral Source" and seeds them into the
 * Nurturing column of the Referral Source Pipeline (Sales & BD).
 */
export function AddToNurturingButton({ contact }: AddToNurturingButtonProps) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const name = contactDisplayName(contact);

  const { data: existingSource, isLoading } = useQuery({
    queryKey: ['referral-source-for-contact', contact?.id, name],
    enabled: !!contact?.id,
    queryFn: async () => {
      const { data: byContact } = await supabase
        .from('referral_sources')
        .select('id')
        .eq('contact_id', contact.id)
        .limit(1);
      if (byContact && byContact.length > 0) return byContact[0];
      if (!name) return null;
      const { data: byName } = await supabase
        .from('referral_sources')
        .select('id')
        .ilike('name', name)
        .limit(1);
      return byName?.[0] ?? null;
    },
  });

  if (!contact?.id || isLoading || existingSource) return null;

  const handleAdd = async () => {
    if (!name) {
      toast.error('Contact needs a name before adding to Nurturing');
      return;
    }
    setSaving(true);
    try {
      let next = contact;
      if (!hasReferralSourceTag(contact.contact_type)) {
        const types = splitContactTypes(contact.contact_type);
        const updatedType = [...types, REFERRAL_SOURCE_TAG].join(' ; ');
        const { data, error } = await supabase
          .from('contacts')
          .update({ contact_type: updatedType, last_modified_by: user?.id } as any)
          .eq('id', contact.id)
          .select()
          .single();
        if (error) throw error;
        next = data;
      }

      await ensureReferralSourceForContact(next, user?.id, company?.id ?? next?.org_company_id);

      queryClient.invalidateQueries({ queryKey: ['contact', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['referral-sources'] });
      queryClient.invalidateQueries({ queryKey: ['deal-referral-sources'] });
      queryClient.invalidateQueries({ queryKey: ['referral-source-for-contact', contact.id] });
      toast.success('Added to Nurturing and tagged as a Referral Source');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add to Nurturing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleAdd} disabled={saving}>
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
      ) : (
        <Sprout className="h-3.5 w-3.5 mr-1" />
      )}
      Add to Nurturing
    </Button>
  );
}

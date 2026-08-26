import { supabase } from '@/integrations/supabase/client';
import { splitContactTypes } from '@/components/contacts/ContactTypeMultiSelect';

export const REFERRAL_SOURCE_TAG = 'Referral Source';

export function hasReferralSourceTag(contactType: string | null | undefined): boolean {
  return splitContactTypes(contactType).some(
    (t) => t.trim().toLowerCase() === REFERRAL_SOURCE_TAG.toLowerCase()
  );
}

function displayName(contact: any): string {
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim();
  return (contact?.full_name || name || contact?.email || '').trim();
}

/**
 * When a contact carries the "Referral Source" tag, make sure they exist as a
 * manual referral source. Manual sources with no qualifying deals render in the
 * "Nurturing" column of the Referral Source Pipeline (Sales & BD dashboard).
 * Safe to call repeatedly — it no-ops when a matching source already exists.
 */
export async function ensureReferralSourceForContact(
  contact: any,
  userId: string | null | undefined,
  companyId?: string | null
): Promise<void> {
  try {
    if (!contact || !userId) return;
    if (!hasReferralSourceTag(contact.contact_type)) return;

    const name = displayName(contact);
    if (!name) return;

    // Already tracked by contact id?
    const { data: byContact } = await supabase
      .from('referral_sources')
      .select('id')
      .eq('contact_id', contact.id)
      .limit(1);
    if (byContact && byContact.length > 0) return;

    // Or by name for this user (the manual-source list is user scoped).
    const { data: byName } = await supabase
      .from('referral_sources')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', name)
      .limit(1);
    if (byName && byName.length > 0) return;

    await supabase.from('referral_sources').insert({
      name,
      email: contact.email ?? null,
      phone: contact.phone_mobile ?? contact.phone_work ?? null,
      contact_id: contact.id ?? null,
      contact_name: name,
      contact_email: contact.email ?? null,
      user_id: userId,
      company_id: companyId ?? contact.org_company_id ?? null,
    } as any);
  } catch (e) {
    console.warn('[referral source auto-add] failed', e);
  }
}

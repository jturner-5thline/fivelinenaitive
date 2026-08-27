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
): Promise<'created' | 'exists' | 'skipped'> {
  try {
    if (!contact || !userId) return 'skipped';
    if (!hasReferralSourceTag(contact.contact_type)) return 'skipped';

    const name = displayName(contact);
    if (!name) return 'skipped';

    // Already tracked by contact id?
    const { data: byContact } = await supabase
      .from('referral_sources')
      .select('id')
      .eq('contact_id', contact.id)
      .limit(1);
    if (byContact && byContact.length > 0) return 'exists';

    // Or by name within the workspace (the manual-source list is shared by the
    // whole workspace, so dedupe across users, not per-user).
    const resolvedCompanyId = companyId ?? contact.org_company_id ?? null;
    let byNameQuery = supabase
      .from('referral_sources')
      .select('id')
      .ilike('name', name)
      .limit(1);
    byNameQuery = resolvedCompanyId
      ? byNameQuery.eq('company_id', resolvedCompanyId)
      : byNameQuery.eq('user_id', userId);
    const { data: byName } = await byNameQuery;
    if (byName && byName.length > 0) return 'exists';

    const { error: insertError } = await supabase.from('referral_sources').insert({
      name,
      email: contact.email ?? null,
      phone: contact.phone_mobile ?? contact.phone_work ?? null,
      contact_id: contact.id ?? null,
      contact_name: name,
      contact_email: contact.email ?? null,
      user_id: userId,
      company_id: companyId ?? contact.org_company_id ?? null,
    } as any);
    if (insertError) throw insertError;
    return 'created';
  } catch (e) {
    console.warn('[referral source auto-add] failed', e);
    return 'skipped';
  }
}

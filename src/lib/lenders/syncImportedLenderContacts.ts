import { supabase } from '@/integrations/supabase/client';
import { syncLenderContactToCrm } from './syncLenderContactToCrm';

/** Repair imported child contacts and materialize legacy CSV primary contacts. */
export async function syncImportedLenderContacts(lenderId: string, opts: { userId: string; orgCompanyId: string }): Promise<void> {
  const { data: lender, error: lenderError } = await supabase.from('master_lenders')
    .select('id, contact_name, contact_title, email, contact_phone, contact_geography')
    .eq('id', lenderId).maybeSingle();
  if (lenderError) throw lenderError;
  if (!lender) throw new Error('Imported funding source is not accessible.');
  const { data, error } = await supabase.from('lender_contacts').select('*').eq('lender_id', lenderId);
  if (error) throw error;
  const contacts = [...(data ?? [])];
  const name = lender.contact_name?.trim() || '';
  const email = lender.email?.trim() || '';
  const primaryExists = contacts.some(c => email
    ? c.email?.trim().toLowerCase() === email.toLowerCase()
    : c.name.trim().toLowerCase() === name.toLowerCase());
  if ((name || email) && !primaryExists) {
    const { data: created, error: createError } = await supabase.from('lender_contacts').insert({
      lender_id: lenderId, name: name || email, email: email || null,
      title: lender.contact_title, phone: lender.contact_phone, geography: lender.contact_geography,
      is_primary: !contacts.some(c => c.is_primary),
    }).select('*').single();
    if (createError) throw createError;
    contacts.push(created);
  }
  // Sequential resolution also reuses a contact created earlier in the same import.
  for (const contact of contacts) {
    const result = await syncLenderContactToCrm(lenderId, contact, { ...opts, existingContactId: contact.contact_id });
    if (!result) throw new Error('Funding source saved, but a contact could not be linked to Contacts.');
    const { error: linkError } = await supabase.from('lender_contacts').update({ contact_id: result.contactId })
      .eq('id', contact.id).eq('lender_id', lenderId);
    if (linkError) throw linkError;
  }
}
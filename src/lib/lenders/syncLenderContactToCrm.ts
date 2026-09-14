import { supabase } from '@/integrations/supabase/client';

export interface LenderContactCrmInput {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

const hostOf = (url?: string | null) =>
  (url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();

/**
 * Ensures a funding-source contact also exists in the contacts database and is
 * linked to the CRM company record for that funding source. Creates the CRM
 * company (and back-links it on master_lenders) when it doesn't exist yet.
 * Best-effort: never throws — the lender_contacts row is the source of truth.
 */
export async function syncLenderContactToCrm(
  lenderId: string,
  contact: LenderContactCrmInput,
  opts: { userId?: string | null; orgCompanyId?: string | null } = {},
): Promise<{ contactId: string; crmCompanyId: string | null } | null> {
  try {
    const { data: lender } = await supabase
      .from('master_lenders')
      .select('id, name, website, crm_company_id')
      .eq('id', lenderId)
      .maybeSingle();
    if (!lender) return null;

    let crmCompanyId: string | null = (lender as any).crm_company_id ?? null;

    if (!crmCompanyId && lender.name) {
      let q = supabase.from('crm_companies').select('id, name, domain').ilike('name', lender.name).limit(1);
      if (opts.orgCompanyId) q = q.eq('org_company_id', opts.orgCompanyId);
      const { data: existing } = await q;
      if (existing && existing.length) crmCompanyId = existing[0].id;
    }

    if (!crmCompanyId && lender.name) {
      const { data: created } = await supabase
        .from('crm_companies')
        .insert({
          name: lender.name,
          domain: hostOf((lender as any).website) || null,
          created_by: opts.userId || null,
          org_company_id: opts.orgCompanyId || null,
        } as any)
        .select('id')
        .single();
      crmCompanyId = created?.id ?? null;
    }

    if (crmCompanyId && !(lender as any).crm_company_id) {
      await supabase.from('master_lenders').update({ crm_company_id: crmCompanyId } as any).eq('id', lenderId);
    }

    const email = contact.email?.trim().toLowerCase() || null;
    const parts = contact.name.trim().split(/\s+/);
    const firstName = parts[0] || contact.name.trim();
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

    if (email) {
      let q = supabase.from('contacts').select('id, crm_company_id, job_title').ilike('email', email).limit(1);
      if (opts.orgCompanyId) q = q.eq('org_company_id', opts.orgCompanyId);
      const { data: found } = await q;
      if (found && found.length) {
        const existing = found[0];
        const updates: Record<string, any> = { last_modified_by: opts.userId || null };
        if (!existing.crm_company_id && crmCompanyId) updates.crm_company_id = crmCompanyId;
        if (!existing.job_title && contact.title) updates.job_title = contact.title;
        if (contact.city?.trim()) updates.city = contact.city.trim();
        if (contact.state?.trim()) {
          updates.state = contact.state.trim();
          updates.state_region = contact.state.trim();
        }
        if (contact.country?.trim()) updates.country = contact.country.trim();
        await supabase.from('contacts').update(updates as any).eq('id', existing.id);
        return { contactId: existing.id, crmCompanyId };
      }
    }

    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert({
        first_name: firstName,
        last_name: lastName,
        full_name: contact.name.trim(),
        email,
        phone_work: contact.phone?.trim() || null,
        job_title: contact.title?.trim() || null,
        city: contact.city?.trim() || null,
        state: contact.state?.trim() || null,
        state_region: contact.state?.trim() || null,
        country: contact.country?.trim() || null,
        crm_company_id: crmCompanyId,
        email_domain_normalized: email ? email.split('@')[1] || null : hostOf((lender as any).website) || null,
        created_by: opts.userId || null,
        org_company_id: opts.orgCompanyId || null,
      } as any)
      .select('id')
      .single();
    if (error) throw error;
    return { contactId: inserted.id, crmCompanyId };
  } catch (e) {
    console.warn('[syncLenderContactToCrm] failed', e);
    return null;
  }
}

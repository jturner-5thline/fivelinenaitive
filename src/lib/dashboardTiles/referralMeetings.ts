/**
 * "Meetings w/ Existing Referral Sources" candidate meetings — shared by the
 * Sales & BD tile (useReferralSourceMetrics) and the read-only MCP tool.
 * Calendar events come from the calendar-meetings-all function; sales calls,
 * deal syncs, client/deal-name meetings, funding-source meetings, internal-only
 * and attendee-less holds are removed. Manual exclusions are applied by callers.
 * Import-safe: relative imports only.
 */
import type { AnySupabase } from "./stageQueries";
import { isExcludedDealName } from "../../utils/excludedDeals";
import { normalizeEntityName, titleMatchesEntity, entityNameVariants } from "../entityTitleMatch";
import { INTERNAL_DOMAINS, domainOf } from "../internalDomains";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MeetingRow {
  id: string;
  title: string | null;
  started_at: string | null;
  matched_contact_id: string | null;
  matched_crm_company_id: string | null;
  organizer_email?: string | null;
  /** Internal (5th Line) attendee emails — used for per-user filtering. */
  internal_emails?: string[];
  recording_url?: string | null;
  transcript?: string | null;
  transcript_available?: boolean;
  claap_meeting_id?: string | null;
}


const FUNDING_SOURCE_NAME_SUFFIXES = new Set([
  'capital',
  'credit',
  'finance',
  'financial',
  'fund',
  'funding',
  'global',
  'group',
  'holdings',
  'management',
  'partners',
]);

export function fundingSourceTitleAliases(value: string) {
  const normalized = normalizeEntityName(value);
  if (!normalized) return [];

  const words = normalized.split(' ');
  while (words.length > 1 && FUNDING_SOURCE_NAME_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }

  const shortened = words.join(' ');
  return Array.from(new Set([normalized, shortened])).filter((name) => name.length >= 3);
}


export async function loadReferralSourceMeetings(
  sb: AnySupabase,
  companyId: string,
  startIso: string,
  endIso: string,
): Promise<MeetingRow[]> {
      const { data, error } = await sb.functions.invoke('calendar-meetings-all', {
        body: {
          company_id: companyId,
          time_min: startIso,
          time_max: endIso,
        },
      });
      if (error) throw error;
      const all = (data?.events || []) as any[];
      if (all.length === 0) return [];

      const SALES_TITLE = /<>\s*(5th\s*line|5thline|naitive)/i;
      const DEAL_SYNC_TITLE = /deal\s*sync/i;
      let candidates = all
        .filter((event) => !SALES_TITLE.test(event.title || '') && !DEAL_SYNC_TITLE.test(event.title || ''))
        .map((event) => ({
          ...event,
          id: String(event.id),
          started_at: event.start || null,
          matched_contact_id: event.matched_contact_id || null,
          matched_crm_company_id: event.matched_crm_company_id || null,
          organizer_email: event.organizer_email || null,
          internal_emails: Array.isArray(event.internal_emails) ? event.internal_emails : [],
        })) as MeetingRow[];
      if (candidates.length === 0) return [];

      // Page through every deal: PostgREST caps a single request at 1000 rows,
      // which used to silently drop client names like "Microvi" and "ODK Media".
      const dealNameRows: { company: string | null }[] = [];
      for (let page = 0; page < 20; page += 1) {
        const from = page * 1000;
        const { data: chunk } = await sb
          .from('deals')
          .select('company')
          .eq('company_id', companyId)
          .not('company', 'is', null)
          .range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        dealNameRows.push(...(chunk as any[]));
        if (chunk.length < 1000) break;
      }
      const dealNames = Array.from(new Set((dealNameRows || [])
        .filter((d: any) => !isExcludedDealName(String(d.company || '')))
        .flatMap((d: any) => entityNameVariants(String(d.company || '')))
        .filter((n) => n.length >= 3 && !isExcludedDealName(n))));

      if (dealNames.length > 0) {
        candidates = candidates.filter((m) => {
          const title = normalizeEntityName(m.title || '');
          return !title || !dealNames.some((name) => titleMatchesEntity(title, name));
        });
      }
      if (candidates.length === 0) return [];

      const clientDomains = new Set<string>();
      const addEmailDomain = (value: unknown) => {
        const domain = domainOf(typeof value === 'string' ? value : null);
        if (domain && !INTERNAL_DOMAINS.has(domain)) clientDomains.add(domain);
      };
      const addWebsiteDomain = (value: unknown) => {
        if (typeof value !== 'string' || !value.trim()) return;
        const normalized = value.trim().toLowerCase()
          .replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('?')[0];
        if (normalized && normalized.includes('.') && !INTERNAL_DOMAINS.has(normalized)) clientDomains.add(normalized);
      };
      // Client identity is sourced from every deal in this workspace, not just
      // the currently active pipelines, so older clients are excluded as well.
      const clientDeals: any[] = [];
      for (let page = 0; page < 20; page += 1) {
        const from = page * 1000;
        const { data: chunk } = await sb.from('deals')
          .select('id, contact_email, company_url, crm_company_id')
          .eq('company_id', companyId)
          .range(from, from + 999);
        if (!chunk || chunk.length === 0) break;
        clientDeals.push(...(chunk as any[]));
        if (chunk.length < 1000) break;
      }
      {
        const dealRows = (clientDeals || []) as any[];

        for (const deal of dealRows) {
          addEmailDomain(deal.contact_email);
          addWebsiteDomain(deal.company_url);
        }
        const dealIds = dealRows.map((deal) => deal.id).filter(Boolean);
        // Only deal-linked companies/contacts count as clients. Companies and
        // contacts matched to the meetings themselves are often the referral
        // source, so seeding them here would make referral calls exclude
        // themselves.
        const crmCompanyIds = new Set<string>(
          dealRows.map((deal) => deal.crm_company_id).filter(Boolean),
        );
        const linkedContactIds = new Set<string>();
        const addContactDetails = (contact: any) => {
          addEmailDomain(contact.email);
          for (const email of contact.additional_emails || []) addEmailDomain(email);
          addWebsiteDomain(contact.website_url);
          if (contact.crm_company_id) crmCompanyIds.add(contact.crm_company_id);
        };

        // Start with deal-linked contacts plus any contact identified by Claap.
        // Their crm_company_id is the authoritative affiliation key, and then
        // every contact at that CRM company is included below.
        for (let offset = 0; offset < dealIds.length; offset += 500) {
          const { data: links } = await sb
            .from('contact_deals').select('contact_id').in('deal_id', dealIds.slice(offset, offset + 500));
          for (const link of (links || []) as any[]) if (link.contact_id) linkedContactIds.add(link.contact_id);
        }
        const linkedIds = Array.from(linkedContactIds);
        for (let offset = 0; offset < linkedIds.length; offset += 500) {
          const slice = linkedIds.slice(offset, offset + 500);
          const { data: contacts } = await sb
            .from('contacts').select('email, additional_emails, website_url, crm_company_id').in('id', slice);
          for (const contact of (contacts || []) as any[]) addContactDetails(contact);
        }

        const uniqueCrmCompanyIds = Array.from(crmCompanyIds);
        for (let offset = 0; offset < uniqueCrmCompanyIds.length; offset += 500) {
          const slice = uniqueCrmCompanyIds.slice(offset, offset + 500);
          const { data: crmCompanies } = await sb
            .from('crm_companies')
            .select('website_url, domain, domain_normalized, additional_domains, main_contact_email')
            .in('id', slice);
          for (const crmCompany of (crmCompanies || []) as any[]) {
            addWebsiteDomain(crmCompany.website_url);
            addWebsiteDomain(crmCompany.domain);
            addWebsiteDomain(crmCompany.domain_normalized);
            for (const extra of crmCompany.additional_domains || []) addWebsiteDomain(extra);
            addEmailDomain(crmCompany.main_contact_email);
          }
          // Include every contact at each client CRM company, not only the
          // contact that happened to be linked to the deal.
          const { data: companyContacts } = await sb
            .from('contacts').select('email, additional_emails, website_url').in('crm_company_id', slice);
          for (const contact of (companyContacts || []) as any[]) {
            addEmailDomain(contact.email);
            for (const email of contact.additional_emails || []) addEmailDomain(email);
            addWebsiteDomain(contact.website_url);
          }
        }
      }

      const lenderDomains = new Set<string>();
      const lenderNames = new Set<string>();
      const lenderContactIds = new Set<string>();
      const { data: lenders } = await sb.from('master_lenders').select('id, name, email, website');
      for (const lender of (lenders || []) as any[]) {
        for (const raw of [lender.email, lender.website]) {
          const domain = domainOf(typeof raw === 'string' && raw.includes('@')
            ? raw
            : `x@${String(raw || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]}`);
          if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
        }
        for (const alias of fundingSourceTitleAliases(String(lender.name || ''))) lenderNames.add(alias);
      }
      const { data: lenderPeople } = await sb.from('lender_contacts').select('email, contact_id');
      for (const person of (lenderPeople || []) as any[]) {
        const domain = domainOf(person.email);
        if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
        if (person.contact_id) lenderContactIds.add(person.contact_id);
      }
      const { data: lenderContacts } = await sb.from('contacts')
        .select('id, email').eq('company_id', companyId).ilike('contact_type', '%lender%');
      for (const contact of (lenderContacts || []) as any[]) {
        lenderContactIds.add(contact.id);
        const domain = domainOf(contact.email);
        if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
      }

      return candidates.filter((meeting) => {
        const rawTitle = String(meeting.title || '').trim().toLowerCase();
        if (rawTitle === 'block' || rawTitle === 'blocked') return false;
        const title = normalizeEntityName(meeting.title || '');
        if (title && [...lenderNames].some((name) => titleMatchesEntity(title, name))) return false;
        if (meeting.matched_contact_id && lenderContactIds.has(meeting.matched_contact_id)) return false;
        const domains = ((meeting as any).attendee_domains || []) as string[];
        const attendeeCount = Array.isArray((meeting as any).attendees) ? (meeting as any).attendees.length : 0;
        // Exclude events with no attendees (personal holds/blocks)
        if (attendeeCount === 0 && domains.length === 0) return false;
        if (domains.length === 0) return true;
        if (domains.every((domain) => INTERNAL_DOMAINS.has(domain))) return false;
        if (domains.some((domain) => clientDomains.has(domain))) return false;
        if (domains.some((domain) => lenderDomains.has(domain))) return false;
        return true;
      });

}

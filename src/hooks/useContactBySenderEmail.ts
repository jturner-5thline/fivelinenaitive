import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SenderContactCard {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  companyName: string | null;
  lastActivityDate: string | null;
  /** Most-recent deal this contact is associated with, if any. */
  recentDeal: { id: string; name: string; stage: string | null; status: string | null } | null;
}

/**
 * useContactBySenderEmail
 * ------------------------
 * Looks up a single contact in the CRM whose primary or additional emails
 * match the inbound sender. Returns lightweight card metadata plus the
 * most-recent deal the contact is associated with via `contact_deals`.
 *
 * Used by the unmatched-email AI panel to enrich threads that have no
 * deal link of their own (rule #1 in the spec).
 */
export function useContactBySenderEmail(senderEmail: string | undefined | null) {
  const { user } = useAuth();
  const normalized = (senderEmail || '').trim().toLowerCase();

  return useQuery({
    queryKey: ['contact-by-sender-email', normalized, user?.id],
    enabled: !!user && !!normalized && normalized.includes('@'),
    staleTime: 60_000,
    queryFn: async (): Promise<SenderContactCard | null> => {
      // Match on primary email OR additional_emails[]. Use OR with `cs`
      // (contains) for the array column — pgrst's pg array contains operator.
      const { data: contacts } = await supabase
        .from('contacts')
        .select(
          'id, full_name, first_name, last_name, email, job_title, primary_company_id, last_activity_date'
        )
        .or(`email.eq.${normalized},additional_emails.cs.{${normalized}}`)
        .limit(1);

      const contact = contacts?.[0];
      if (!contact) return null;

      // Resolve company name in one extra query (cheap; primary_company_id
      // can be null for unaffiliated contacts).
      let companyName: string | null = null;
      if (contact.primary_company_id) {
        const { data: company } = await supabase
          .from('crm_companies')
          .select('name')
          .eq('id', contact.primary_company_id)
          .maybeSingle();
        companyName = company?.name || null;
      }

      // Most-recent deal via contact_deals → deals (sorted by created_at).
      const { data: dealRows } = await supabase
        .from('contact_deals')
        .select('deal_id, deals(id, company, stage, status, created_at)')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const recent = (dealRows || [])
        .map((row: any) => row.deals)
        .filter(Boolean)
        .sort((a: any, b: any) =>
          (b?.created_at || '').localeCompare(a?.created_at || '')
        )[0];

      const fullName =
        contact.full_name ||
        [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
        contact.email ||
        'Unnamed contact';

      return {
        id: contact.id,
        fullName,
        email: contact.email || normalized,
        jobTitle: contact.job_title,
        companyName,
        lastActivityDate: contact.last_activity_date,
        recentDeal: recent
          ? {
              id: recent.id,
              name: recent.company || 'Unnamed deal',
              stage: recent.stage ?? null,
              status: recent.status ?? null,
            }
          : null,
      };
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const LENDER_ENGAGEMENT_SELECT =
  'id, lender_id, contact_id, crm_company_id, deal_id, activity_type, subject, body, direction, occurred_at, source, external_ref, metadata';

/** Builds a link to the original item from an external_ref (gmail:/claap:/gcal:). */
export function engagementSourceUrl(externalRef: string | null | undefined): string | null {
  if (!externalRef) return null;
  const [kind, ...rest] = externalRef.split(':');
  const id = rest.join(':');
  if (!id) return null;
  if (kind === 'gmail') return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
  if (kind === 'claap') return `https://app.claap.io/recordings/${encodeURIComponent(id)}`;
  return null;
}

/** Read-time dedupe matching SELECT DISTINCT ON (contact_id, occurred_at, subject). */
export function dedupeImportedEmails<T extends { contact_id: string | null; occurred_at: string; subject: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = `${r.contact_id}|${new Date(r.occurred_at).getTime()}|${r.subject ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function useLenderEngagements(lenderId: string | undefined, page: number, pageSize: number, type: string) {
  return useQuery({
    queryKey: ['lender-engagements', lenderId, page, pageSize, type],
    enabled: !!lenderId,
    queryFn: async () => {
      let q = supabase
        .from('lender_engagements')
        .select(`${LENDER_ENGAGEMENT_SELECT}, deals(id, name)`, { count: 'exact' })
        .eq('lender_id', lenderId!)
        .order('occurred_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (type !== 'all') q = q.eq('activity_type', type);
      const { data, error, count } = await q;
      if (error) {
        // deals embed may not exist as a FK; retry without it.
        let q2 = supabase.from('lender_engagements').select(LENDER_ENGAGEMENT_SELECT, { count: 'exact' })
          .eq('lender_id', lenderId!).order('occurred_at', { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (type !== 'all') q2 = q2.eq('activity_type', type);
        const r2 = await q2;
        if (r2.error) throw r2.error;
        return { rows: (r2.data ?? []) as any[], count: r2.count ?? 0 };
      }
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });
}

export function useLenderImportedEmails(lenderId: string | undefined) {
  return useQuery({
    queryKey: ['lender-imported-emails', lenderId],
    enabled: !!lenderId,
    queryFn: async () => {
      const { data: lcs, error } = await supabase
        .from('lender_contacts').select('contact_id').eq('lender_id', lenderId!).not('contact_id', 'is', null);
      if (error) throw error;
      const ids = Array.from(new Set((lcs ?? []).map((r: any) => r.contact_id).filter(Boolean)));
      if (!ids.length) return [];
      const { data, error: e2 } = await supabase
        .from('contact_activities')
        .select('id, contact_id, subject, body, occurred_at, metadata')
        .in('contact_id', ids).eq('activity_type', 'email')
        .order('occurred_at', { ascending: false }).limit(1000);
      if (e2) throw e2;
      return dedupeImportedEmails((data ?? []) as any[]);
    },
  });
}

export function useEngagementsBy(column: 'contact_id' | 'crm_company_id', id: string | undefined) {
  return useQuery({
    queryKey: ['lender-engagements-by', column, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lender_engagements').select(`${LENDER_ENGAGEMENT_SELECT}, master_lenders(name)`)
        .eq(column, id!).order('occurred_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

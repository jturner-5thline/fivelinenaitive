import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface QuickFindContact {
  id: string;
  name: string;
  sublabel?: string;
}
export interface QuickFindCrmCompany {
  id: string;
  name: string;
  sublabel?: string;
}
export interface QuickFindTask {
  id: string;
  title: string;
  sublabel?: string;
}

export interface QuickFindResults {
  contacts: QuickFindContact[];
  crmCompanies: QuickFindCrmCompany[];
  tasks: QuickFindTask[];
}

/**
 * Debounces a rapidly-changing string. Used to keep the quickfind
 * dropdown from firing a network request on every keystroke.
 */
function useDebounced<T>(value: T, delay = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const EMPTY: QuickFindResults = { contacts: [], crmCompanies: [], tasks: [] };

/**
 * Server-side quickfind for the Ask nAItive bar. Runs parallel scoped
 * lookups for CRM companies, contacts and tasks (deals, lenders, and
 * pages are still resolved client-side from in-memory contexts). RLS +
 * `org_company_id` / `company_id` filters keep results tenant-safe.
 */
export function useQuickFind(rawQuery: string): {
  results: QuickFindResults;
  isFetching: boolean;
} {
  const { company } = useCompany();
  const query = useDebounced(rawQuery.trim(), 150);
  const enabled = Boolean(company?.id) && query.length >= 2;

  const { data, isFetching } = useQuery<QuickFindResults>({
    queryKey: ['quick-find', company?.id, query.toLowerCase()],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const orgId = company!.id;

      const [companiesRes, contactsRes, tasksRes] = await Promise.all([
        supabase
          .from('crm_companies')
          .select('id, name, domain, industry')
          .eq('org_company_id', orgId)
          .or(`name.ilike.${like},domain.ilike.${like}`)
          .limit(5),
        supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email, job_title')
          .eq('org_company_id', orgId)
          .or(
            `full_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`,
          )
          .limit(5),
        supabase
          .from('tasks')
          .select('id, title, status, due_date')
          .eq('company_id', orgId)
          .ilike('title', like)
          .limit(5),
      ]);

      return {
        crmCompanies: (companiesRes.data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name || 'Untitled company',
          sublabel: c.domain || c.industry || undefined,
        })),
        contacts: (contactsRes.data ?? []).map((c: any) => ({
          id: c.id,
          name:
            c.full_name ||
            [c.first_name, c.last_name].filter(Boolean).join(' ') ||
            c.email ||
            'Untitled contact',
          sublabel: c.job_title || c.email || undefined,
        })),
        tasks: (tasksRes.data ?? []).map((t: any) => ({
          id: t.id,
          title: t.title || 'Untitled task',
          sublabel: t.status || undefined,
        })),
      };
    },
  });

  return { results: data ?? EMPTY, isFetching: enabled && isFetching };
}
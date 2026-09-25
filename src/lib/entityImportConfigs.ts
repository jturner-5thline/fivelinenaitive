import { supabase } from '@/integrations/supabase/client';
import type { EntityImportConfig } from '@/components/shared/EntityCsvImportDialog';
import { COMPANY_CSV, CONTACT_COMPANY_NAME, CONTACT_CSV, DEAL_CSV } from '@/utils/csvSchemas';
import { normDomain, normKey } from '@/utils/entityCsv';

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function dealImportConfig(opts: { userId?: string; companyId?: string | null; pipelineId?: string | null }): EntityImportConfig {
  return {
    table: 'deals',
    schema: DEAL_CSV,
    noun: 'deals',
    templateFilename: 'deals-template.csv',
    requiredHint: 'Pick which column holds the Company.',
    mappingReady: k => k.has('company'),
    isImportable: r => !!r.company,
    identityKeys: r => [`n:${normKey(r.company)}`],
    loadExisting: async () => {
      const rows = await fetchAll<{ id: string; company: string }>((a, b) => {
        let q = supabase.from('deals').select('id, company').is('merged_into', null);
        q = opts.companyId ? q.eq('company_id', opts.companyId) : q.eq('user_id', opts.userId ?? '');
        return q.range(a, b);
      });
      return new Map(rows.map(r => [`n:${normKey(r.company)}`, r.id]));
    },
    prepare: async (recs, mode) => {
      if (!opts.userId) throw new Error('Not signed in');
      if (mode === 'update') {
        const now = new Date().toISOString();
        return recs.map(({ company: _c, ...rest }) => (Object.keys(rest).length ? { ...rest, updated_at: now } : {}));
      }
      return recs.map(r => ({
        ...r,
        value: r.value ?? 0,
        user_id: opts.userId,
        company_id: opts.companyId ?? null,
        pipeline_id: opts.pipelineId ?? null,
      }));
    },
    summary: r => ({ title: r.company, detail: [r.stage, r.deal_owner, r.contact].filter(Boolean).join(' · ') }),
  };
}

const contactName = (r: Record<string, any>) =>
  r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ');

export function contactImportConfig(opts: { userId?: string; orgCompanyId?: string | null }): EntityImportConfig {
  return {
    table: 'contacts',
    schema: CONTACT_CSV,
    noun: 'contacts',
    templateFilename: 'contacts-template.csv',
    requiredHint: 'Pick a column for Email or a name (Full Name, or First/Last Name).',
    mappingReady: k => k.has('email') || k.has('full_name') || k.has('first_name') || k.has('last_name'),
    isImportable: r => !!(r.email || contactName(r)),
    identityKeys: r => [r.email && `e:${normKey(r.email)}`, !r.email && contactName(r) && `n:${normKey(contactName(r))}`].filter(Boolean) as string[],
    loadExisting: async () => {
      if (!opts.orgCompanyId) return new Map();
      const rows = await fetchAll<{ id: string; email: string | null; full_name: string | null; first_name: string | null; last_name: string | null }>((a, b) =>
        supabase.from('contacts').select('id, email, full_name, first_name, last_name').eq('org_company_id', opts.orgCompanyId!).range(a, b));
      const m = new Map<string, string>();
      for (const r of rows) {
        if (r.email) m.set(`e:${normKey(r.email)}`, r.id);
        const n = contactName(r);
        if (n && !m.has(`n:${normKey(n)}`)) m.set(`n:${normKey(n)}`, r.id);
      }
      return m;
    },
    prepare: async (recs, mode) => {
      if (!opts.orgCompanyId) throw new Error('No workspace selected');
      // Resolve "Company Name" to CRM companies, creating missing ones.
      const names = [...new Set(recs.map(r => String(r[CONTACT_COMPANY_NAME] ?? '').trim()).filter(Boolean))];
      const byName = new Map<string, string>();
      if (names.length) {
        const existing = await fetchAll<{ id: string; name: string }>((a, b) =>
          supabase.from('crm_companies').select('id, name').eq('org_company_id', opts.orgCompanyId!).range(a, b));
        existing.forEach(c => byName.set(normKey(c.name), c.id));
        const missing = names.filter(n => !byName.has(normKey(n)));
        for (let i = 0; i < missing.length; i += 100) {
          const { data } = await supabase.from('crm_companies')
            .insert(missing.slice(i, i + 100).map(name => ({ name, org_company_id: opts.orgCompanyId, created_by: opts.userId })) as any)
            .select('id, name');
          (data ?? []).forEach((c: any) => byName.set(normKey(c.name), c.id));
        }
      }
      return recs.map(r => {
        const { [CONTACT_COMPANY_NAME]: co, ...rest } = r;
        const out: Record<string, any> = { ...rest };
        if (co) { const id = byName.get(normKey(co)); if (id) out.crm_company_id = id; }
        if (out.email) out.email_domain_normalized = String(out.email).split('@')[1]?.toLowerCase() ?? null;
        if (!out.full_name && (out.first_name || out.last_name)) out.full_name = contactName(out);
        if (mode === 'insert') { out.org_company_id = opts.orgCompanyId; out.created_by = opts.userId; }
        else out.last_modified_by = opts.userId;
        return out;
      });
    },
    summary: r => ({ title: contactName(r) || r.email, detail: [r.email, r.job_title, r[CONTACT_COMPANY_NAME]].filter(Boolean).join(' · ') }),
  };
}

export function companyImportConfig(opts: { userId?: string; orgCompanyId?: string | null }): EntityImportConfig {
  const domainOf = (r: Record<string, any>) => normDomain(r.domain || r.website_url);
  return {
    table: 'crm_companies',
    schema: COMPANY_CSV,
    noun: 'companies',
    templateFilename: 'companies-template.csv',
    requiredHint: 'Pick which column holds the Company Name.',
    mappingReady: k => k.has('name'),
    isImportable: r => !!r.name,
    identityKeys: r => [domainOf(r) && `d:${domainOf(r)}`, `n:${normKey(r.name)}`].filter(Boolean) as string[],
    loadExisting: async () => {
      if (!opts.orgCompanyId) return new Map();
      const rows = await fetchAll<{ id: string; name: string; domain: string | null }>((a, b) =>
        supabase.from('crm_companies').select('id, name, domain').eq('org_company_id', opts.orgCompanyId!).range(a, b));
      const m = new Map<string, string>();
      for (const r of rows) {
        if (r.domain) m.set(`d:${normDomain(r.domain)}`, r.id);
        if (!m.has(`n:${normKey(r.name)}`)) m.set(`n:${normKey(r.name)}`, r.id);
      }
      return m;
    },
    prepare: async (recs, mode) => {
      if (!opts.orgCompanyId) throw new Error('No workspace selected');
      return recs.map(r => {
        const out: Record<string, any> = { ...r };
        if (!out.domain && out.website_url) out.domain = normDomain(out.website_url);
        if (mode === 'insert') { out.org_company_id = opts.orgCompanyId; out.created_by = opts.userId; }
        else { delete out.name; out.last_modified_by = opts.userId; }
        return out;
      });
    },
    summary: r => ({ title: r.name, detail: [r.domain || r.website_url, r.industry, r.hq_city].filter(Boolean).join(' · ') }),
  };
}

/** Fetch full rows for export in chunks by id or by scope. */
export async function fetchRowsByIds(table: 'deals', columns: string, ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(table).select(columns).in('id', ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

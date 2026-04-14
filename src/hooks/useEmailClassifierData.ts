import { useMemo } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import { useCompany } from '@/hooks/useCompany';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight record used by the email classifier to match emails
 * against known deals/companies in the system.
 */
export interface ClassifierEntity {
  /** Normalised deal or company name (lowercase, trimmed) */
  name: string;
  /** Normalised domain(s) without protocol/www */
  domains: string[];
  /** Extra search tokens (URL fragments, short names, aliases) */
  tokens: string[];
}

/** Extract a bare domain from a URL/domain string */
function normaliseDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\/.*$/, '');
  return d;
}

/** Break a company/deal name into searchable tokens (≥2 chars) */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

/**
 * React hook that produces the `ClassifierEntity[]` array consumed
 * by `classifyEmail`.  Lightweight and memo'd so it doesn't re-fetch
 * on every render.
 */
export function useEmailClassifierData(): ClassifierEntity[] {
  const { deals } = useDealsContext();
  const { company } = useCompany();

  // Fetch CRM companies (lightweight query — id, name, domain, additional_domains, website)
  const { data: crmCompanies } = useQuery({
    queryKey: ['email_classifier_crm_companies', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60_000, // 5 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name, domain, additional_domains')
        .eq('org_company_id', company!.id)
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  return useMemo(() => {
    const entities: ClassifierEntity[] = [];
    const seenNames = new Set<string>();

    // ── Deals ──────────────────────────────────────────
    for (const deal of deals) {
      const normName = deal.name.trim().toLowerCase();
      const companyName = (deal.company || '').trim().toLowerCase();
      const domains: string[] = [];
      const tokens: string[] = [
        ...nameTokens(deal.name),
        ...nameTokens(deal.company || ''),
      ];

      if (deal.companyUrl) {
        const d = normaliseDomain(deal.companyUrl);
        if (d) {
          domains.push(d);
          // Also add base domain without subdomains for broader matching
          const parts = d.split('.');
          if (parts.length > 2) tokens.push(parts.slice(-2).join('.'));
        }
      }

      const key = `${normName}|${companyName}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        entities.push({
          name: normName || companyName,
          domains,
          tokens: [...new Set(tokens)],
        });
        // Also add company name separately if different
        if (companyName && companyName !== normName && !seenNames.has(companyName)) {
          seenNames.add(companyName);
          entities.push({ name: companyName, domains, tokens: [...new Set(nameTokens(companyName))] });
        }
      }
    }

    // ── CRM Companies ──────────────────────────────────
    for (const c of crmCompanies || []) {
      const normName = (c.name || '').trim().toLowerCase();
      if (!normName || seenNames.has(normName)) continue;
      seenNames.add(normName);

      const domains: string[] = [];
      if (c.domain) {
        const d = normaliseDomain(c.domain);
        if (d) domains.push(d);
      }
      for (const ad of c.additional_domains || []) {
        const d = normaliseDomain(ad);
        if (d) domains.push(d);
      }
      if ((c as any).website) {
        const d = normaliseDomain((c as any).website);
        if (d && !domains.includes(d)) domains.push(d);
      }

      entities.push({
        name: normName,
        domains: [...new Set(domains)],
        tokens: [...new Set(nameTokens(normName))],
      });
    }

    return entities;
  }, [deals, crmCompanies]);
}

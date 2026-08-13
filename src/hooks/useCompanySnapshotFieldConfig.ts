import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export type CustomCompanyFieldType = 'text' | 'select' | 'multiselect';

export interface CustomCompanyField {
  key: string;              // stored in crm_companies.custom_fields
  label: string;
  type: CustomCompanyFieldType;
  options?: string[];
  order: number;
}

export interface CompanyFieldConfig {
  /** Built-in snapshot field keys the admin has hidden. */
  disabled: string[];
  custom: CustomCompanyField[];
}

const DEFAULT: CompanyFieldConfig = { disabled: [], custom: [] };

/** Built-in snapshot fields that admins can show/hide. */
export const BUILTIN_SNAPSHOT_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'industry', label: 'Industry' },
  { key: 'owner_user_id', label: 'Company owner' },
  { key: 'company_type', label: 'Type' },
  { key: 'employee_range', label: 'Employees' },
  { key: 'hq_city', label: 'City' },
  { key: 'hq_country', label: 'Country' },
  { key: 'domain', label: 'Domain' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'phone', label: 'Phone' },
  { key: 'main_contact_email', label: 'Primary email' },
];

function normalize(raw: any): CompanyFieldConfig {
  const disabled = Array.isArray(raw?.disabled) ? raw.disabled.filter((s: any) => typeof s === 'string') : [];
  const custom = Array.isArray(raw?.custom)
    ? raw.custom
        .filter((f: any) => f && typeof f.key === 'string' && typeof f.label === 'string')
        .map((f: any, i: number) => ({
          key: String(f.key),
          label: String(f.label),
          type: (['text', 'select', 'multiselect'].includes(f.type) ? f.type : 'text') as CustomCompanyFieldType,
          options: Array.isArray(f.options) ? f.options.map(String) : undefined,
          order: Number.isFinite(f.order) ? Number(f.order) : i,
        }))
        .sort((a: CustomCompanyField, b: CustomCompanyField) => a.order - b.order)
    : [];
  return { disabled, custom };
}

export function useCompanySnapshotFieldConfig() {
  const { company, isAdmin } = useCompany();
  const [config, setConfig] = useState<CompanyFieldConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('company_settings')
      .select('company_field_config')
      .eq('company_id', company.id)
      .maybeSingle();
    setConfig(normalize((data as any)?.company_field_config));
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`company-field-config:${company.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'company_settings', filter: `company_id=eq.${company.id}` },
        () => { fetchConfig(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, fetchConfig]);

  const isDisabled = useCallback(
    (key: string) => config.disabled.includes(key),
    [config.disabled],
  );

  const save = useCallback(async (next: CompanyFieldConfig) => {
    if (!company?.id || !isAdmin) return;
    const payload = normalize(next);
    setConfig(payload);
    const { error } = await supabase
      .from('company_settings')
      .upsert({ company_id: company.id, company_field_config: payload as any }, { onConflict: 'company_id' });
    if (error) {
      await fetchConfig();
      throw error;
    }
  }, [company?.id, isAdmin, fetchConfig]);

  return useMemo(() => ({ config, loading, isDisabled, save, isAdmin }), [config, loading, isDisabled, save, isAdmin]);
}

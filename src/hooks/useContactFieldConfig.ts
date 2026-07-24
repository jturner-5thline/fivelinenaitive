import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export type CustomContactFieldType =
  | 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'email';

export interface CustomContactField {
  key: string;                // stable key used in contacts.custom_fields
  label: string;
  type: CustomContactFieldType;
  options?: string[];         // for type === 'select'
  order: number;
}

export interface ContactFieldConfig {
  /** Built-in field keys the admin has hidden. */
  disabled: string[];
  /** Admin-defined custom fields, rendered after built-ins. */
  custom: CustomContactField[];
}

const DEFAULT: ContactFieldConfig = { disabled: [], custom: [] };

/** Fields that must always be visible and cannot be disabled by admins. */
export const LOCKED_CONTACT_FIELDS = new Set<string>([
  'first_name', 'last_name', 'company', 'owner_user_id',
  'email', 'contact_type', 'status',
]);

/** Toggleable built-in field registry. Order matches on-screen order. */
export const BUILTIN_TOGGLEABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'job_title',    label: 'Job Title' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'phone_mobile', label: 'Mobile' },
  { key: 'phone_work',   label: 'Office Phone' },
  { key: 'city',         label: 'City' },
  { key: 'state',        label: 'State' },
  { key: 'country',      label: 'Country' },
  { key: 'website_url',  label: 'Domain' },
  { key: 'department',   label: 'Department' },
  { key: 'timezone',     label: 'Timezone' },
  { key: 'lead_source',  label: 'Lead Source' },
  { key: 'source_system',label: 'Source System' },
];

function normalize(raw: any): ContactFieldConfig {
  const disabled = Array.isArray(raw?.disabled) ? raw.disabled.filter((s: any) => typeof s === 'string') : [];
  const custom = Array.isArray(raw?.custom)
    ? raw.custom
        .filter((f: any) => f && typeof f.key === 'string' && typeof f.label === 'string')
        .map((f: any, i: number) => ({
          key: String(f.key),
          label: String(f.label),
          type: (['text','number','date','checkbox','select','url','email'].includes(f.type) ? f.type : 'text') as CustomContactFieldType,
          options: Array.isArray(f.options) ? f.options.map(String) : undefined,
          order: Number.isFinite(f.order) ? Number(f.order) : i,
        }))
        .sort((a: CustomContactField, b: CustomContactField) => a.order - b.order)
    : [];
  return { disabled, custom };
}

export function useContactFieldConfig() {
  const { company, isAdmin } = useCompany();
  const [config, setConfig] = useState<ContactFieldConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('company_settings')
      .select('contact_field_config')
      .eq('company_id', company.id)
      .maybeSingle();
    setConfig(normalize((data as any)?.contact_field_config));
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Realtime sync so all users see admin changes without reload.
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`contact-field-config:${company.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'company_settings', filter: `company_id=eq.${company.id}` },
        () => { fetchConfig(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, fetchConfig]);

  const isDisabled = useCallback(
    (key: string) => !LOCKED_CONTACT_FIELDS.has(key) && config.disabled.includes(key),
    [config.disabled],
  );

  const save = useCallback(async (next: ContactFieldConfig) => {
    if (!company?.id || !isAdmin) return;
    const payload = normalize(next);
    setConfig(payload); // optimistic
    const { error } = await supabase
      .from('company_settings')
      .upsert({ company_id: company.id, contact_field_config: payload as any }, { onConflict: 'company_id' });
    if (error) {
      // Roll back by refetching
      await fetchConfig();
      throw error;
    }
  }, [company?.id, isAdmin, fetchConfig]);

  return useMemo(() => ({ config, loading, isDisabled, save, isAdmin }), [config, loading, isDisabled, save, isAdmin]);
}
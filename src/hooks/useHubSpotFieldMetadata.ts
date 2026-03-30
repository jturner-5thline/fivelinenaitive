import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface HubSpotFieldMetadata {
  id: string;
  object_type: 'contact' | 'company';
  internal_name: string;
  label: string;
  hubspot_type: string | null;
  hubspot_field_type: string | null;
  options: Array<{ label: string; value: string }> | null;
  group_name: string | null;
  is_read_only: boolean;
  is_system: boolean;
  mapped_column_name: string | null;
  mapped_column_type: string | null;
  is_mapped: boolean;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LayoutConfig {
  id: string;
  object_type: 'contact' | 'company';
  name: string;
  is_default: boolean;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LayoutSection {
  id: string;
  layout_id: string;
  title: string;
  display_order: number;
  is_collapsed_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LayoutSectionField {
  id: string;
  section_id: string;
  field_metadata_id: string;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  column_span: 1 | 2;
  created_at: string;
  updated_at: string;
  // joined
  field_metadata?: HubSpotFieldMetadata;
}

export function useHubSpotFieldMetadata(objectType: 'contact' | 'company') {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['hubspot-field-metadata', objectType, company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hubspot_field_metadata')
        .select('*')
        .eq('object_type', objectType)
        .eq('company_id', company!.id)
        .order('label');
      if (error) throw error;
      return (data || []) as HubSpotFieldMetadata[];
    },
    enabled: !!company?.id,
  });
}

export function useLayoutConfig(objectType: 'contact' | 'company') {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['hubspot-layout-config', objectType, company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hubspot_layout_configs')
        .select('*')
        .eq('object_type', objectType)
        .eq('company_id', company!.id)
        .eq('is_default', true)
        .maybeSingle();
      if (error) throw error;
      return data as LayoutConfig | null;
    },
    enabled: !!company?.id,
  });
}

export function useLayoutSections(layoutId: string | undefined) {
  return useQuery({
    queryKey: ['hubspot-layout-sections', layoutId],
    queryFn: async () => {
      if (!layoutId) return [];
      const { data, error } = await supabase
        .from('hubspot_layout_sections')
        .select('*')
        .eq('layout_id', layoutId)
        .order('display_order');
      if (error) throw error;
      return (data || []) as LayoutSection[];
    },
    enabled: !!layoutId,
  });
}

export function useLayoutSectionFields(sectionIds: string[]) {
  return useQuery({
    queryKey: ['hubspot-layout-section-fields', sectionIds],
    queryFn: async () => {
      if (!sectionIds.length) return [];
      const { data, error } = await supabase
        .from('hubspot_layout_section_fields')
        .select('*, field_metadata:hubspot_field_metadata(*)')
        .in('section_id', sectionIds)
        .order('display_order');
      if (error) throw error;
      return (data || []) as LayoutSectionField[];
    },
    enabled: sectionIds.length > 0,
  });
}

export function useSaveLayout() {
  const queryClient = useQueryClient();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async ({
      objectType,
      sections,
    }: {
      objectType: 'contact' | 'company';
      sections: Array<{
        id?: string;
        title: string;
        display_order: number;
        is_collapsed_default: boolean;
        fields: Array<{
          field_metadata_id: string;
          display_order: number;
          is_visible: boolean;
          is_required: boolean;
          column_span: 1 | 2;
        }>;
      }>;
    }) => {
      if (!company?.id) throw new Error('No company');

      // Upsert layout config
      const { data: layoutConfig, error: lcError } = await supabase
        .from('hubspot_layout_configs')
        .upsert(
          {
            object_type: objectType,
            name: `Default ${objectType === 'contact' ? 'Contact' : 'Company'} Layout`,
            is_default: true,
            company_id: company.id,
          },
          { onConflict: 'object_type,company_id,is_default' }
        )
        .select()
        .single();

      // If upsert fails due to no unique constraint, try select then insert/update
      let layoutId: string;
      if (lcError) {
        // Try to find existing
        const { data: existing } = await supabase
          .from('hubspot_layout_configs')
          .select('id')
          .eq('object_type', objectType)
          .eq('company_id', company.id)
          .eq('is_default', true)
          .maybeSingle();
        
        if (existing) {
          layoutId = existing.id;
        } else {
          const { data: newConfig, error: insertErr } = await supabase
            .from('hubspot_layout_configs')
            .insert({
              object_type: objectType,
              name: `Default ${objectType === 'contact' ? 'Contact' : 'Company'} Layout`,
              is_default: true,
              company_id: company.id,
            })
            .select()
            .single();
          if (insertErr) throw insertErr;
          layoutId = newConfig!.id;
        }
      } else {
        layoutId = layoutConfig!.id;
      }

      // Delete old sections (cascade deletes fields)
      await supabase
        .from('hubspot_layout_sections')
        .delete()
        .eq('layout_id', layoutId);

      // Insert new sections
      for (const section of sections) {
        const { data: sectionData, error: sErr } = await supabase
          .from('hubspot_layout_sections')
          .insert({
            layout_id: layoutId,
            title: section.title,
            display_order: section.display_order,
            is_collapsed_default: section.is_collapsed_default,
          })
          .select()
          .single();
        if (sErr) throw sErr;

        // Insert fields for this section
        if (section.fields.length > 0) {
          const fieldRows = section.fields.map((f) => ({
            section_id: sectionData!.id,
            field_metadata_id: f.field_metadata_id,
            display_order: f.display_order,
            is_visible: f.is_visible,
            is_required: f.is_required,
            column_span: f.column_span,
          }));
          const { error: fErr } = await supabase
            .from('hubspot_layout_section_fields')
            .insert(fieldRows);
          if (fErr) throw fErr;
        }
      }

      return layoutId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-layout-config'] });
      queryClient.invalidateQueries({ queryKey: ['hubspot-layout-sections'] });
      queryClient.invalidateQueries({ queryKey: ['hubspot-layout-section-fields'] });
      toast.success('Layout saved');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save layout'),
  });
}

// Seed default field metadata for a company
export function useSeedFieldMetadata() {
  const queryClient = useQueryClient();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (objectType: 'contact' | 'company') => {
      if (!company?.id) throw new Error('No company');

      const fields = objectType === 'contact' ? CONTACT_DEFAULT_FIELDS : COMPANY_DEFAULT_FIELDS;

      const rows = fields.map((f: any) => ({
        object_type: objectType,
        internal_name: f.internal_name,
        label: f.label,
        hubspot_type: f.hubspot_type,
        hubspot_field_type: f.hubspot_field_type,
        group_name: f.group_name,
        is_read_only: f.is_read_only || false,
        is_system: f.is_system || false,
        mapped_column_name: f.mapped_column_name,
        mapped_column_type: f.mapped_column_type || 'TEXT',
        is_mapped: true,
        company_id: company.id,
        options: f.options || null,
      }));

      // Use upsert to avoid duplicates
      const { error } = await supabase
        .from('hubspot_field_metadata')
        .upsert(rows as any, { onConflict: 'object_type,internal_name,company_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hubspot-field-metadata'] });
      toast.success('Field metadata seeded');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to seed metadata'),
  });
}

const CONTACT_DEFAULT_FIELDS = [
  { internal_name: 'first_name', label: 'First Name', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Identity', mapped_column_name: 'first_name', mapped_column_type: 'TEXT' },
  { internal_name: 'last_name', label: 'Last Name', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Identity', mapped_column_name: 'last_name', mapped_column_type: 'TEXT' },
  { internal_name: 'email', label: 'Email', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Identity', mapped_column_name: 'email', mapped_column_type: 'TEXT' },
  { internal_name: 'phone_work', label: 'Work Phone', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'phone_work', mapped_column_type: 'TEXT' },
  { internal_name: 'phone_mobile', label: 'Mobile Phone', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'phone_mobile', mapped_column_type: 'TEXT' },
  { internal_name: 'job_title', label: 'Job Title', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Professional', mapped_column_name: 'job_title', mapped_column_type: 'TEXT' },
  { internal_name: 'department', label: 'Department', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Professional', mapped_column_name: 'department', mapped_column_type: 'TEXT' },
  { internal_name: 'seniority', label: 'Seniority', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Professional', mapped_column_name: 'seniority', mapped_column_type: 'TEXT' },
  { internal_name: 'lifecycle_stage', label: 'Lifecycle Stage', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Lifecycle', mapped_column_name: 'lifecycle_stage', mapped_column_type: 'TEXT',
    options: [{ label: 'Subscriber', value: 'subscriber' }, { label: 'Lead', value: 'lead' }, { label: 'MQL', value: 'mql' }, { label: 'SQL', value: 'sql' }, { label: 'Opportunity', value: 'opportunity' }, { label: 'Customer', value: 'customer' }, { label: 'Evangelist', value: 'evangelist' }] },
  { internal_name: 'status', label: 'Status', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Lifecycle', mapped_column_name: 'status', mapped_column_type: 'TEXT',
    options: [{ label: 'New', value: 'new' }, { label: 'Working', value: 'working' }, { label: 'Meeting Scheduled', value: 'meeting_scheduled' }, { label: 'Converted', value: 'converted' }, { label: 'Closed', value: 'closed' }] },
  { internal_name: 'buying_role', label: 'Buying Role', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Lifecycle', mapped_column_name: 'buying_role', mapped_column_type: 'TEXT',
    options: [{ label: 'Economic Buyer', value: 'economic_buyer' }, { label: 'Champion', value: 'champion' }, { label: 'Influencer', value: 'influencer' }, { label: 'User', value: 'user' }, { label: 'Blocker', value: 'blocker' }] },
  { internal_name: 'lead_source', label: 'Lead Source', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Marketing', mapped_column_name: 'lead_source', mapped_column_type: 'TEXT' },
  { internal_name: 'campaign', label: 'Campaign', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Marketing', mapped_column_name: 'campaign', mapped_column_type: 'TEXT' },
  { internal_name: 'linkedin_url', label: 'LinkedIn URL', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Social', mapped_column_name: 'linkedin_url', mapped_column_type: 'TEXT' },
  { internal_name: 'website_url', label: 'Website URL', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Social', mapped_column_name: 'website_url', mapped_column_type: 'TEXT' },
  { internal_name: 'timezone', label: 'Timezone', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'timezone', mapped_column_type: 'TEXT' },
  { internal_name: 'preferred_channel', label: 'Preferred Channel', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'preferred_channel', mapped_column_type: 'TEXT' },
  { internal_name: 'description', label: 'Description', hubspot_type: 'string', hubspot_field_type: 'textarea', group_name: 'Other', mapped_column_name: 'description', mapped_column_type: 'TEXT' },
  { internal_name: 'contact_score', label: 'Contact Score', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Scoring', mapped_column_name: 'contact_score', mapped_column_type: 'NUMERIC', is_read_only: true },
  { internal_name: 'behavioral_score', label: 'Behavioral Score', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Scoring', mapped_column_name: 'behavioral_score', mapped_column_type: 'NUMERIC', is_read_only: true },
  { internal_name: 'fit_score', label: 'Fit Score', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Scoring', mapped_column_name: 'fit_score', mapped_column_type: 'NUMERIC', is_read_only: true },
  { internal_name: 'email_opt_in', label: 'Email Opt-in', hubspot_type: 'bool', hubspot_field_type: 'checkbox', group_name: 'Consent', mapped_column_name: 'email_opt_in', mapped_column_type: 'BOOLEAN' },
  { internal_name: 'phone_opt_in', label: 'Phone Opt-in', hubspot_type: 'bool', hubspot_field_type: 'checkbox', group_name: 'Consent', mapped_column_name: 'phone_opt_in', mapped_column_type: 'BOOLEAN' },
  { internal_name: 'sms_opt_in', label: 'SMS Opt-in', hubspot_type: 'bool', hubspot_field_type: 'checkbox', group_name: 'Consent', mapped_column_name: 'sms_opt_in', mapped_column_type: 'BOOLEAN' },
];

const COMPANY_DEFAULT_FIELDS = [
  { internal_name: 'name', label: 'Company Name', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Identity', mapped_column_name: 'name', mapped_column_type: 'TEXT' },
  { internal_name: 'domain', label: 'Domain', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Identity', mapped_column_name: 'domain', mapped_column_type: 'TEXT' },
  { internal_name: 'industry', label: 'Industry', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Firmographics', mapped_column_name: 'industry', mapped_column_type: 'TEXT' },
  { internal_name: 'sub_industry', label: 'Sub-Industry', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Firmographics', mapped_column_name: 'sub_industry', mapped_column_type: 'TEXT' },
  { internal_name: 'employee_count', label: 'Employee Count', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Firmographics', mapped_column_name: 'employee_count', mapped_column_type: 'NUMERIC' },
  { internal_name: 'employee_range', label: 'Employee Range', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Firmographics', mapped_column_name: 'employee_range', mapped_column_type: 'TEXT' },
  { internal_name: 'annual_revenue', label: 'Annual Revenue', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Financial', mapped_column_name: 'annual_revenue', mapped_column_type: 'NUMERIC' },
  { internal_name: 'revenue_band', label: 'Revenue Band', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Financial', mapped_column_name: 'revenue_band', mapped_column_type: 'TEXT' },
  { internal_name: 'arr', label: 'ARR', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Financial', mapped_column_name: 'arr', mapped_column_type: 'NUMERIC' },
  { internal_name: 'mrr', label: 'MRR', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Financial', mapped_column_name: 'mrr', mapped_column_type: 'NUMERIC' },
  { internal_name: 'total_contract_value', label: 'Total Contract Value', hubspot_type: 'number', hubspot_field_type: 'number', group_name: 'Financial', mapped_column_name: 'total_contract_value', mapped_column_type: 'NUMERIC' },
  { internal_name: 'phone', label: 'Phone', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'phone', mapped_column_type: 'TEXT' },
  { internal_name: 'main_contact_email', label: 'Main Contact Email', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Contact Info', mapped_column_name: 'main_contact_email', mapped_column_type: 'TEXT' },
  { internal_name: 'website_url', label: 'Website', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Social', mapped_column_name: 'website_url', mapped_column_type: 'TEXT' },
  { internal_name: 'linkedin_url', label: 'LinkedIn', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Social', mapped_column_name: 'linkedin_url', mapped_column_type: 'TEXT' },
  { internal_name: 'hq_city', label: 'City', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Address', mapped_column_name: 'hq_city', mapped_column_type: 'TEXT' },
  { internal_name: 'hq_state', label: 'State', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Address', mapped_column_name: 'hq_state', mapped_column_type: 'TEXT' },
  { internal_name: 'hq_country', label: 'Country', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Address', mapped_column_name: 'hq_country', mapped_column_type: 'TEXT' },
  { internal_name: 'hq_postal_code', label: 'Postal Code', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Address', mapped_column_name: 'hq_postal_code', mapped_column_type: 'TEXT' },
  { internal_name: 'lifecycle_stage', label: 'Lifecycle Stage', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Lifecycle', mapped_column_name: 'lifecycle_stage', mapped_column_type: 'TEXT',
    options: [{ label: 'Target', value: 'target' }, { label: 'Engaged', value: 'engaged' }, { label: 'Opportunity', value: 'opportunity' }, { label: 'Customer', value: 'customer' }, { label: 'Expansion', value: 'expansion' }, { label: 'Churn Risk', value: 'churn_risk' }] },
  { internal_name: 'status', label: 'Status', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Lifecycle', mapped_column_name: 'status', mapped_column_type: 'TEXT',
    options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'Target', value: 'target' }, { label: 'Churned', value: 'churned' }] },
  { internal_name: 'company_type', label: 'Company Type', hubspot_type: 'enumeration', hubspot_field_type: 'select', group_name: 'Classification', mapped_column_name: 'company_type', mapped_column_type: 'TEXT',
    options: [{ label: 'Customer', value: 'customer' }, { label: 'Prospect', value: 'prospect' }, { label: 'Partner', value: 'partner' }, { label: 'Vendor', value: 'vendor' }, { label: 'Other', value: 'other' }] },
  { internal_name: 'segment', label: 'Segment', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Classification', mapped_column_name: 'segment', mapped_column_type: 'TEXT' },
  { internal_name: 'customer_tier', label: 'Customer Tier', hubspot_type: 'string', hubspot_field_type: 'text', group_name: 'Classification', mapped_column_name: 'customer_tier', mapped_column_type: 'TEXT' },
  { internal_name: 'description', label: 'Description', hubspot_type: 'string', hubspot_field_type: 'textarea', group_name: 'Other', mapped_column_name: 'description', mapped_column_type: 'TEXT' },
  { internal_name: 'renewal_date', label: 'Renewal Date', hubspot_type: 'datetime', hubspot_field_type: 'date', group_name: 'Contract', mapped_column_name: 'renewal_date', mapped_column_type: 'TIMESTAMPTZ' },
  { internal_name: 'contract_end_date', label: 'Contract End Date', hubspot_type: 'datetime', hubspot_field_type: 'date', group_name: 'Contract', mapped_column_name: 'contract_end_date', mapped_column_type: 'TIMESTAMPTZ' },
  { internal_name: 'contract_start_date', label: 'Contract Start Date', hubspot_type: 'datetime', hubspot_field_type: 'date', group_name: 'Contract', mapped_column_name: 'contract_start_date', mapped_column_type: 'TIMESTAMPTZ' },
];

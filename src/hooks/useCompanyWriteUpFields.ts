import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useAdminCompanyOverride } from '@/contexts/AdminCompanyOverrideContext';
import { WRITEUP_FIELD_CONFIG, WriteUpFieldId } from '@/hooks/useWriteUpFieldOrder';

export interface CompanyWriteUpField {
  id: string;
  company_id: string;
  field_key: string;
  label: string;
  is_visible: boolean;
  is_required: boolean;
  position: number;
  field_type: string;
}

// Default fields that get seeded if company has no config yet
const DEFAULT_FIELDS: { field_key: WriteUpFieldId; label: string; is_required: boolean; position: number }[] = [
  { field_key: 'companyName', label: 'Company Name', is_required: true, position: 0 },
  { field_key: 'companyUrl', label: 'Company URL', is_required: false, position: 1 },
  { field_key: 'description', label: 'Company Overview', is_required: false, position: 2 },
  { field_key: 'linkedinUrl', label: 'LinkedIn URL', is_required: false, position: 3 },
  { field_key: 'location', label: 'Location', is_required: true, position: 4 },
  { field_key: 'industries', label: 'Industry', is_required: true, position: 5 },
  { field_key: 'yearFounded', label: 'Year Founded', is_required: false, position: 6 },
  { field_key: 'customerBase', label: 'Customer Base', is_required: false, position: 7 },
  { field_key: 'headcount', label: 'Headcount', is_required: false, position: 8 },
  { field_key: 'dealTypes', label: 'Deal Type', is_required: true, position: 9 },
  { field_key: 'billingModels', label: 'Billing Model', is_required: true, position: 10 },
  { field_key: 'profitability', label: 'Profitability', is_required: true, position: 11 },
  { field_key: 'grossMargins', label: 'Gross Margins', is_required: true, position: 12 },
  { field_key: 'capitalAsk', label: 'Capital Ask', is_required: true, position: 13 },
  { field_key: 'financialDataAsOf', label: 'Financial Data As Of', is_required: false, position: 14 },
  { field_key: 'accountingSystem', label: 'Accounting System', is_required: false, position: 15 },
  { field_key: 'status', label: 'Status', is_required: false, position: 16 },
  { field_key: 'useOfFunds', label: 'Use of Funds', is_required: false, position: 17 },
  { field_key: 'existingDebtDetails', label: 'Existing Debt Details', is_required: false, position: 18 },
];

export function useCompanyWriteUpFields() {
  const { user } = useAuth();
  const { company } = useCompany();
  const override = useAdminCompanyOverride();
  const effectiveCompanyId = override?.companyId ?? company?.id ?? null;

  const [fields, setFields] = useState<CompanyWriteUpField[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFields = useCallback(async () => {
    if (!effectiveCompanyId) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_write_up_fields')
        .select('*')
        .eq('company_id', effectiveCompanyId)
        .order('position', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Seed defaults
        const inserts = DEFAULT_FIELDS.map(f => ({
          company_id: effectiveCompanyId,
          ...f,
          is_visible: true,
          field_type: 'text',
        }));
        const { data: seeded, error: seedError } = await supabase
          .from('company_write_up_fields')
          .insert(inserts)
          .select('*');
        if (seedError) throw seedError;
        setFields(seeded || []);
      } else {
        setFields(data);
      }
    } catch (err) {
      console.error('Failed to load write-up fields:', err);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveCompanyId]);

  useEffect(() => { loadFields(); }, [loadFields]);

  const updateField = useCallback(async (fieldId: string, updates: Partial<Pick<CompanyWriteUpField, 'label' | 'is_visible' | 'is_required' | 'position'>>) => {
    const { error } = await supabase
      .from('company_write_up_fields')
      .update(updates)
      .eq('id', fieldId);
    if (error) { console.error('Failed to update field:', error); return false; }
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
    return true;
  }, []);

  const reorderFields = useCallback(async (newOrder: string[]) => {
    // newOrder is array of field IDs in new order
    const updates = newOrder.map((id, idx) => ({ id, position: idx }));
    // Optimistic
    setFields(prev => {
      const map = new Map(prev.map(f => [f.id, f]));
      return newOrder.map((id, idx) => ({ ...map.get(id)!, position: idx }));
    });
    // Persist
    for (const u of updates) {
      await supabase.from('company_write_up_fields').update({ position: u.position }).eq('id', u.id);
    }
  }, []);

  const toggleVisibility = useCallback(async (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    await updateField(fieldId, { is_visible: !field.is_visible });
  }, [fields, updateField]);

  const toggleRequired = useCallback(async (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    await updateField(fieldId, { is_required: !field.is_required });
  }, [fields, updateField]);

  const updateLabel = useCallback(async (fieldId: string, label: string) => {
    await updateField(fieldId, { label });
  }, [updateField]);

  const resetToDefaults = useCallback(async () => {
    if (!effectiveCompanyId) return;
    // Delete all and re-seed
    await supabase.from('company_write_up_fields').delete().eq('company_id', effectiveCompanyId);
    await loadFields();
  }, [effectiveCompanyId, loadFields]);

  return {
    fields,
    isLoading,
    updateField,
    reorderFields,
    toggleVisibility,
    toggleRequired,
    updateLabel,
    resetToDefaults,
    reload: loadFields,
  };
}

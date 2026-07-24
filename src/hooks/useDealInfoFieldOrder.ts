import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

export type DealInfoFieldId =
  | 'narrative'
  | 'dealManager'
  | 'dealOwner'
  | 'type'
  | 'engagement'
  | 'exclusivity'
  | 'affiliatedContacts'
  | 'companyUrl'
  | 'businessModel'
  | 'clientContact'
  | 'referralSource'
  | 'analyst'
  | 'sourcedVia'
  | 'hoursAndFees';

export interface DealInfoFieldConfig {
  id: DealInfoFieldId;
  label: string;
  section: 'main' | 'hours-fees';
  column: 'left' | 'right' | 'full';
  canHide: boolean;
  /**
   * When true the field is always visible — the visibility toggle is
   * disabled and locked on. The field can still be reordered or removed
   * by an admin, but it can never be hidden. Used for Narrative and
   * Deal Owner per product spec.
   */
  lockedVisible?: boolean;
}

export const DEAL_INFO_FIELD_DEFINITIONS: DealInfoFieldConfig[] = [
  { id: 'narrative', label: 'Narrative', section: 'main', column: 'full', canHide: true, lockedVisible: true },
  { id: 'dealManager', label: 'Deal Manager', section: 'main', column: 'left', canHide: false },
  { id: 'dealOwner', label: 'Deal Owner', section: 'main', column: 'left', canHide: true, lockedVisible: true },
  { id: 'type', label: 'Type', section: 'main', column: 'left', canHide: true },
  { id: 'engagement', label: 'Engagement', section: 'main', column: 'left', canHide: true },
  { id: 'exclusivity', label: 'Exclusivity', section: 'main', column: 'left', canHide: true },
  { id: 'affiliatedContacts', label: 'Affiliated Contacts', section: 'main', column: 'left', canHide: true },
  { id: 'companyUrl', label: 'Company URL', section: 'main', column: 'right', canHide: true },
  { id: 'businessModel', label: 'Business Model', section: 'main', column: 'right', canHide: true },
  { id: 'clientContact', label: 'Client Contact', section: 'main', column: 'right', canHide: true },
  { id: 'referralSource', label: 'Referral Source', section: 'main', column: 'right', canHide: true },
  { id: 'analyst', label: 'Analyst', section: 'main', column: 'right', canHide: true },
  { id: 'sourcedVia', label: 'Sourced Via', section: 'main', column: 'right', canHide: true },
  { id: 'hoursAndFees', label: 'Hours & Fees', section: 'hours-fees', column: 'full', canHide: true },
];

export const DEFAULT_FIELD_ORDER: DealInfoFieldId[] = DEAL_INFO_FIELD_DEFINITIONS.map(f => f.id);

const DEFAULT_FIELD_VISIBILITY: Record<DealInfoFieldId, boolean> = Object.fromEntries(
  DEAL_INFO_FIELD_DEFINITIONS.map(f => [f.id, true])
) as Record<DealInfoFieldId, boolean>;

interface DealInfoLayout {
  order: DealInfoFieldId[];
  visibility: Record<DealInfoFieldId, boolean>;
}

export function useDealInfoFieldOrder() {
  const { user } = useAuth();
  const [fieldOrder, setFieldOrder] = useState<DealInfoFieldId[]>(DEFAULT_FIELD_ORDER);
  const [fieldVisibility, setFieldVisibility] = useState<Record<DealInfoFieldId, boolean>>(DEFAULT_FIELD_VISIBILITY);
  const [isLoading, setIsLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch company ID
  useEffect(() => {
    const fetchCompanyId = async () => {
      if (!user) { setCompanyId(null); return; }
      try {
        const { data } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) setCompanyId(data.company_id);
      } catch (err) {
        console.error('Failed to fetch company ID:', err);
      }
    };
    fetchCompanyId();
  }, [user]);

  // Load layout
  useEffect(() => {
    const loadLayout = async () => {
      setIsLoading(true);
      if (user && companyId) {
        try {
          const { data, error } = await supabase
            .from('company_settings')
            .select('deal_info_layout')
            .eq('company_id', companyId)
            .maybeSingle();

          if (!error && data?.deal_info_layout) {
            const layout = data.deal_info_layout as unknown as DealInfoLayout;
            if (layout.order && Array.isArray(layout.order)) {
              // Merge: keep all known fields, add any missing ones at end
              const knownIds = new Set(DEFAULT_FIELD_ORDER);
              const validOrder = layout.order.filter((id: string) => knownIds.has(id as DealInfoFieldId)) as DealInfoFieldId[];
              const missing = DEFAULT_FIELD_ORDER.filter(id => !validOrder.includes(id));
              setFieldOrder([...validOrder, ...missing]);
            }
            if (layout.visibility) {
              setFieldVisibility({
                ...DEFAULT_FIELD_VISIBILITY,
                ...layout.visibility,
                dealManager: true, // Always visible
              });
            }
          }
        } catch (err) {
          console.error('Failed to load deal info layout:', err);
        }
      }
      setIsLoading(false);
    };
    loadLayout();
  }, [user, companyId]);

  const saveLayout = useCallback(async (order: DealInfoFieldId[], visibility: Record<DealInfoFieldId, boolean>) => {
    if (!user || !companyId) return;
    try {
      const layout: DealInfoLayout = { order, visibility };
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('company_settings')
          .update({ deal_info_layout: layout as unknown as Json, updated_at: new Date().toISOString() })
          .eq('company_id', companyId);
      } else {
        await supabase
          .from('company_settings')
          .insert([{ company_id: companyId, deal_info_layout: layout as unknown as Json }]);
      }
    } catch (err) {
      console.error('Failed to save deal info layout:', err);
    }
  }, [user, companyId]);

  const debouncedSave = useCallback((order: DealInfoFieldId[], visibility: Record<DealInfoFieldId, boolean>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveLayout(order, visibility), 500);
  }, [saveLayout]);

  const reorderFields = useCallback((newOrder: DealInfoFieldId[]) => {
    setFieldOrder(newOrder);
    debouncedSave(newOrder, fieldVisibility);
  }, [debouncedSave, fieldVisibility]);

  const toggleFieldVisibility = useCallback((fieldId: DealInfoFieldId) => {
    const config = DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId);
    if (!config?.canHide) return;
    if (config.lockedVisible) return; // always shown, cannot be hidden
    setFieldVisibility(prev => {
      const next = { ...prev, [fieldId]: !prev[fieldId] };
      debouncedSave(fieldOrder, next);
      return next;
    });
  }, [debouncedSave, fieldOrder]);

  const isFieldVisible = useCallback((fieldId: DealInfoFieldId): boolean => {
    const config = DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId);
    if (config && !config.canHide) return true;
    if (config?.lockedVisible) return true;
    return fieldVisibility[fieldId] ?? true;
  }, [fieldVisibility]);

  const removeField = useCallback((fieldId: DealInfoFieldId) => {
    const config = DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId);
    // Required + locked-visible fields cannot be removed from the list.
    if (!config?.canHide || config.lockedVisible) return;
    const next = fieldOrder.filter(id => id !== fieldId);
    setFieldOrder(next);
    debouncedSave(next, fieldVisibility);
  }, [debouncedSave, fieldOrder, fieldVisibility]);

  const addField = useCallback((fieldId: DealInfoFieldId) => {
    if (fieldOrder.includes(fieldId)) return;
    if (!DEAL_INFO_FIELD_DEFINITIONS.find(f => f.id === fieldId)) return;
    const next = [...fieldOrder, fieldId];
    setFieldOrder(next);
    debouncedSave(next, fieldVisibility);
  }, [debouncedSave, fieldOrder, fieldVisibility]);

  const resetToDefault = useCallback(() => {
    setFieldOrder(DEFAULT_FIELD_ORDER);
    setFieldVisibility(DEFAULT_FIELD_VISIBILITY);
    saveLayout(DEFAULT_FIELD_ORDER, DEFAULT_FIELD_VISIBILITY);
  }, [saveLayout]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  return {
    fieldOrder,
    fieldVisibility,
    isLoading,
    reorderFields,
    toggleFieldVisibility,
    isFieldVisible,
    removeField,
    addField,
    resetToDefault,
  };
}

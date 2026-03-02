import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DefaultChecklistEntry {
  name: string;
  category: string;
  is_required: boolean;
  description?: string;
}

export interface DefaultChecklistConfig {
  [dealTypeId: string]: {
    label: string;
    items: DefaultChecklistEntry[];
  };
}

export function useDefaultChecklistConfig(companyId: string | undefined) {
  const { user } = useAuth();
  const [config, setConfig] = useState<DefaultChecklistConfig>({});
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!user || !companyId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('data_room_default_checklists')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      setConfig((data?.data_room_default_checklists as unknown as DefaultChecklistConfig) || {});
    } catch (err) {
      console.error('Error fetching default checklist config:', err);
    } finally {
      setLoading(false);
    }
  }, [user, companyId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: DefaultChecklistConfig) => {
    if (!user || !companyId) return false;
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ data_room_default_checklists: newConfig as any })
        .eq('company_id', companyId);

      if (error) throw error;
      setConfig(newConfig);
      toast.success('Default checklist configuration saved');
      return true;
    } catch (err) {
      console.error('Error saving default checklist config:', err);
      toast.error('Failed to save configuration');
      return false;
    }
  }, [user, companyId]);

  return { config, loading, saveConfig, refetch: fetchConfig };
}

/** Populate deal checklist items from the default config for a given deal type */
export async function populateDefaultChecklist(
  dealId: string,
  dealTypeId: string,
  companyId: string,
  userId: string,
): Promise<number> {
  try {
    // Fetch the config
    const { data, error } = await supabase
      .from('company_settings')
      .select('data_room_default_checklists')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) throw error;
    const config = (data?.data_room_default_checklists as unknown as DefaultChecklistConfig) || {};
    const dealTypeConfig = config[dealTypeId];
    if (!dealTypeConfig || !dealTypeConfig.items?.length) return 0;

    // Check if deal already has checklist items
    const { count } = await supabase
      .from('deal_checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('deal_id', dealId);

    if (count && count > 0) return 0; // Already populated

    // Insert items
    const items = dealTypeConfig.items.map((item, idx) => ({
      deal_id: dealId,
      name: item.name,
      category: item.category || null,
      description: item.description || null,
      is_required: item.is_required,
      position: idx,
      created_by: userId,
    }));

    const { error: insertError } = await supabase
      .from('deal_checklist_items')
      .insert(items);

    if (insertError) throw insertError;
    return items.length;
  } catch (err) {
    console.error('Error populating default checklist:', err);
    return 0;
  }
}

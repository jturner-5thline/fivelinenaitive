import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FlexSyncSettings {
  remove_on_due_diligence: boolean;
  remove_on_closed_won: boolean;
  remove_on_closed_lost: boolean;
  remove_on_archived: boolean;
}

const DEFAULTS: FlexSyncSettings = {
  remove_on_due_diligence: true,
  remove_on_closed_won: true,
  remove_on_closed_lost: true,
  remove_on_archived: true,
};

/**
 * Per-company FLEx auto-removal toggles. Defaults to all-ON when no row exists,
 * which mirrors the Postgres trigger's COALESCE behaviour.
 */
export function useFlexSyncSettings(companyId: string | null | undefined) {
  const [settings, setSettings] = useState<FlexSyncSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('flex_sync_settings')
        .select('remove_on_due_diligence,remove_on_closed_won,remove_on_closed_lost,remove_on_archived')
        .eq('company_id', companyId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load flex_sync_settings:', error);
      }
      setSettings(data ? { ...DEFAULTS, ...data } : DEFAULTS);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const updateSetting = useCallback(
    async (key: keyof FlexSyncSettings, value: boolean) => {
      if (!companyId) return;
      const previous = settings;
      const next = { ...settings, [key]: value };
      setSettings(next);
      setIsSaving(true);
      const { error } = await supabase
        .from('flex_sync_settings')
        .upsert(
          { company_id: companyId, ...next, updated_at: new Date().toISOString() },
          { onConflict: 'company_id' },
        );
      setIsSaving(false);
      if (error) {
        console.error('Failed to save flex_sync_settings:', error);
        setSettings(previous);
        toast.error('Could not save FLEx auto-removal rule', {
          description: error.message,
        });
      } else {
        toast.success('FLEx auto-removal rule updated');
      }
    },
    [companyId, settings],
  );

  return { settings, isLoading, isSaving, updateSetting };
}
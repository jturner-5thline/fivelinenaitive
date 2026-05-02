import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';

export interface DealAiSettings {
  data_room_context_enabled: boolean;
  custom_instructions: string;
}

export function useDealAiSettings(dealId: string | null | undefined) {
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const [settings, setSettings] = useState<DealAiSettings>({
    data_room_context_enabled: true,
    custom_instructions: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  const reload = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    try {
      const [settingsRes, dealRes] = await Promise.all([
        supabase
          .from('deal_ai_settings')
          .select('data_room_context_enabled')
          .eq('deal_id', dealId)
          .maybeSingle(),
        supabase
          .from('deals')
          .select('ai_custom_instructions, user_id')
          .eq('id', dealId)
          .maybeSingle(),
      ]);
      setSettings({
        data_room_context_enabled: settingsRes.data?.data_room_context_enabled ?? true,
        custom_instructions: (dealRes.data as any)?.ai_custom_instructions ?? '',
      });
      const ownerId = (dealRes.data as any)?.user_id;
      setCanEdit(!!isAdmin || (!!user?.id && !!ownerId && ownerId === user.id));
    } finally {
      setLoading(false);
    }
  }, [dealId, user?.id, isAdmin]);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (next: Partial<DealAiSettings>) => {
    if (!dealId || !user) return;
    if (!canEdit) {
      toast.error('Only admins or the deal owner can change AI settings.');
      return;
    }
    setSaving(true);
    try {
      const merged = { ...settings, ...next };
      // Upsert toggle row
      const { error: settingsErr } = await supabase
        .from('deal_ai_settings')
        .upsert(
          {
            deal_id: dealId,
            data_room_context_enabled: merged.data_room_context_enabled,
            updated_by: user.id,
          },
          { onConflict: 'deal_id' },
        );
      if (settingsErr) throw settingsErr;
      // Persist custom instructions back onto the deal row
      if (next.custom_instructions !== undefined) {
        const { error: dealErr } = await supabase
          .from('deals')
          .update({ ai_custom_instructions: merged.custom_instructions || null })
          .eq('id', dealId);
        if (dealErr) throw dealErr;
      }
      setSettings(merged);
      toast.success('AI settings saved');
    } catch (err: any) {
      console.error('[deal-ai-settings] save failed', err);
      toast.error(err?.message || 'Could not save AI settings');
    } finally {
      setSaving(false);
    }
  }, [dealId, user, canEdit, settings]);

  return { settings, loading, saving, canEdit, save, reload };
}
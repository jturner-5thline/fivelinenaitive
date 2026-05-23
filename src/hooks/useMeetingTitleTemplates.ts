import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Loads the workspace's per-stage meeting-title templates from
 * `meeting_title_templates`. Returns a record keyed by stage_id, with the
 * empty string '' key holding the workspace Default row.
 */
export function useMeetingTitleTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [orgCompanyId, setOrgCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: cm } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const cid = cm?.company_id ?? null;
      setOrgCompanyId(cid);
      if (!cid) {
        setTemplates({});
        return;
      }
      const { data } = await supabase
        .from('meeting_title_templates')
        .select('stage_id, template')
        .eq('org_company_id', cid);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ stage_id: string | null; template: string }>) {
        map[row.stage_id ?? ''] = row.template;
      }
      setTemplates(map);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { templates, orgCompanyId, isLoading, refetch };
}
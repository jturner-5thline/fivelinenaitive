import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface SupportSession {
  id: string;
  support_user_id: string;
  target_company_id: string;
  started_at: string;
  ended_at: string | null;
}

export function useSupportSession() {
  const { user } = useAuth();
  const { isAdmin } = useAdminRole();
  const queryClient = useQueryClient();

  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const canUseSupport = is5thLine && isAdmin;

  // Fetch active session
  const { data: activeSession, isLoading } = useQuery({
    queryKey: ['support-session', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('support_sessions')
        .select('*')
        .eq('support_user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching support session:', error);
        return null;
      }
      return data as SupportSession | null;
    },
    enabled: !!user?.id && canUseSupport,
    staleTime: 30_000,
  });

  // Fetch company name for active session
  const { data: companyName } = useQuery({
    queryKey: ['support-session-company', activeSession?.target_company_id],
    queryFn: async () => {
      if (!activeSession?.target_company_id) return null;
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', activeSession.target_company_id)
        .single();
      return data?.name ?? null;
    },
    enabled: !!activeSession?.target_company_id,
  });

  const startSession = useCallback(async (targetCompanyId: string) => {
    if (!user?.id || !canUseSupport) return null;

    // End any existing sessions first
    await supabase
      .from('support_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('support_user_id', user.id)
      .is('ended_at', null);

    const { data, error } = await supabase
      .from('support_sessions')
      .insert({
        support_user_id: user.id,
        target_company_id: targetCompanyId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error starting support session:', error);
      return null;
    }

    queryClient.invalidateQueries({ queryKey: ['support-session', user.id] });
    return data as SupportSession;
  }, [user?.id, canUseSupport, queryClient]);

  const endSession = useCallback(async () => {
    if (!user?.id || !activeSession) return;

    await supabase
      .from('support_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeSession.id);

    queryClient.invalidateQueries({ queryKey: ['support-session', user.id] });
  }, [user?.id, activeSession, queryClient]);

  const logAction = useCallback(async (
    action: string,
    resourceType: string,
    resourceId?: string | null,
    details?: Record<string, unknown>,
  ) => {
    if (!user?.id || !activeSession) return;

    await supabase.from('support_audit_logs').insert({
      support_user_id: user.id,
      target_company_id: activeSession.target_company_id,
      action,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      details: details ? (details as any) : null,
    });
  }, [user?.id, activeSession]);

  return {
    canUseSupport,
    activeSession,
    companyName,
    isLoading,
    startSession,
    endSession,
    logAction,
  };
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';

export type SubmissionStatus = 'draft' | 'submitted';

export interface SubmissionRow {
  id: string;
  company_id: string;
  report_key: string;
  period_key: string;
  status: SubmissionStatus;
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  unsubmitted_by: string | null;
  unsubmitted_by_name: string | null;
  unsubmitted_at: string | null;
  submit_count: number;
  audit: Array<{ action: string; at: string; by: string | null; by_name: string | null }>;
}

/**
 * Tracks the per-report-tab × per-period submission state (draft/submitted)
 * for Insights monthly reports (JT/JM/SW). Provides submit() and unsubmit()
 * helpers that persist state + audit history. Realtime subscribed so all
 * viewers see the lock change immediately.
 */
export function useInsightsReportSubmission(reportKey: string | null, periodKey: string | null) {
  const { company } = useCompany();
  const { user } = useAuth();
  const [row, setRow] = useState<SubmissionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const enabled = !!(company?.id && reportKey && periodKey);

  const fetchRow = useCallback(async () => {
    if (!enabled) { setRow(null); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('insights_report_submissions' as any)
      .select('*')
      .eq('company_id', company!.id)
      .eq('report_key', reportKey!)
      .eq('period_key', periodKey!)
      .maybeSingle();
    setRow((data as any) ?? null);
    setLoading(false);
  }, [enabled, company?.id, reportKey, periodKey]);

  useEffect(() => { void fetchRow(); }, [fetchRow]);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`irs:${company!.id}:${reportKey}:${periodKey}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'insights_report_submissions',
        filter: `company_id=eq.${company!.id}`,
      }, (payload: any) => {
        const next = payload.new as SubmissionRow | undefined;
        if (!next) { void fetchRow(); return; }
        if (next.report_key === reportKey && next.period_key === periodKey) {
          setRow(next);
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, company?.id, reportKey, periodKey, fetchRow]);

  const userDisplayName = (user?.user_metadata as any)?.display_name
    || (user?.user_metadata as any)?.full_name
    || user?.email
    || null;

  const writeState = useCallback(async (
    nextStatus: SubmissionStatus,
    action: 'submitted' | 'unsubmitted' | 'resubmitted',
  ): Promise<SubmissionRow | null> => {
    if (!enabled || !user) return null;
    setWorking(true);
    try {
      const nowIso = new Date().toISOString();
      const prevAudit = Array.isArray(row?.audit) ? row!.audit : [];
      const auditEntry = { action, at: nowIso, by: user.id, by_name: userDisplayName };
      const isSubmit = nextStatus === 'submitted';
      const payload: any = {
        company_id: company!.id,
        report_key: reportKey,
        period_key: periodKey,
        status: nextStatus,
        audit: [...prevAudit, auditEntry],
      };
      if (isSubmit) {
        payload.submitted_by = user.id;
        payload.submitted_by_name = userDisplayName;
        payload.submitted_at = nowIso;
        payload.submit_count = (row?.submit_count ?? 0) + 1;
      } else {
        payload.unsubmitted_by = user.id;
        payload.unsubmitted_by_name = userDisplayName;
        payload.unsubmitted_at = nowIso;
      }
      const { data, error } = await supabase
        .from('insights_report_submissions' as any)
        .upsert(payload, { onConflict: 'company_id,report_key,period_key' })
        .select('*')
        .single();
      if (error) throw error;
      setRow(data as any);
      return data as any;
    } finally {
      setWorking(false);
    }
  }, [enabled, user, userDisplayName, row, company?.id, reportKey, periodKey]);

  const submit = useCallback(async () => {
    const isResubmit = (row?.submit_count ?? 0) > 0;
    return writeState('submitted', isResubmit ? 'resubmitted' : 'submitted');
  }, [writeState, row?.submit_count]);

  const unsubmit = useCallback(async () => writeState('draft', 'unsubmitted'), [writeState]);

  return {
    row,
    status: (row?.status ?? 'draft') as SubmissionStatus,
    isLocked: row?.status === 'submitted',
    loading,
    working,
    submit,
    unsubmit,
    refetch: fetchRow,
  };
}
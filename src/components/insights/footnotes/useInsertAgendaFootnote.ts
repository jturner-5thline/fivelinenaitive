import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useInsightsTimeframe, reportingPeriodHelpers } from '@/contexts/InsightsTimeframeContext';
import { toast } from 'sonner';
import {
  AGENDA_INSERT_EVENT,
  type InsertAgendaFootnoteEvent,
  type InsertFootnoteInput,
  type InsertMode,
} from './types';

/**
 * Centralized entry point used by source surfaces (Claap, comments, tasks…)
 * to push a Decision/Note/Action Item into the Agenda's footnote system.
 *
 * For 'marker' / 'freetext' modes, the canonical footnote row is created and
 * an event is dispatched for the mounted Agenda editor to insert a body ref.
 * If no editor is mounted (user is on another tab), the footnote is still
 * created and the user is told to switch to the Agenda to place it.
 */
export function useInsertAgendaFootnote() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { reportingPeriod } = useInsightsTimeframe();

  return useCallback(
    async (input: InsertFootnoteInput, mode: InsertMode = 'marker'): Promise<boolean> => {
      if (!user?.id || !company?.id) {
        toast.error('Sign in required to add to Agenda');
        return false;
      }
      const active = reportingPeriod ?? reportingPeriodHelpers.defaultReportingPeriod('quarter');
      const periodType = active.view as 'month' | 'quarter';
      const periodKey = active.period;

      // Dedup by source identity unless caller forces a duplicate.
      let footnoteId: string | null = null;
      if (!input.duplicate && input.sourceId) {
        const { data: existing } = await supabase
          .from('insights_agenda_footnotes' as any)
          .select('id')
          .eq('company_id', company.id)
          .eq('agenda_period_type', periodType)
          .eq('agenda_period_key', periodKey)
          .eq('source_type', input.sourceType)
          .eq('source_id', input.sourceId)
          .eq('status', 'active')
          .maybeSingle();
        if (existing && (existing as any).id) footnoteId = (existing as any).id;
      }

      if (!footnoteId) {
        const anchor = input.duplicate
          ? `${input.sourceAnchor ?? ''}::${Date.now()}`
          : input.sourceAnchor ?? null;
        const { data, error } = await supabase
          .from('insights_agenda_footnotes' as any)
          .insert({
            company_id: company.id,
            agenda_period_type: periodType,
            agenda_period_key: periodKey,
            footnote_type: input.footnoteType,
            source_type: input.sourceType,
            source_id: input.sourceId ?? null,
            source_anchor: anchor,
            source_snapshot_text: input.snapshotText.slice(0, 8000),
            source_current_text: input.snapshotText.slice(0, 8000),
            source_updated_at: new Date().toISOString(),
            link_url: input.linkUrl ?? null,
            status: 'active',
            created_by: user.id,
          } as any)
          .select('id')
          .single();
        if (error || !data) {
          console.error('[insertAgendaFootnote]', error);
          toast.error('Could not create footnote', { description: error?.message });
          return false;
        }
        footnoteId = (data as any).id;
      }

      if (mode === 'footnote_only') {
        toast.success('Added to Agenda footnotes');
        return true;
      }

      const detail: InsertAgendaFootnoteEvent = {
        footnoteId: footnoteId!,
        refId: crypto.randomUUID(),
        mode,
        label: input.snapshotText.slice(0, 64),
        snapshotText: input.snapshotText,
      };
      // The Agenda editor listens for this. If nothing handles it (e.g. the
      // user is on a non-Agenda tab) we still successfully created the
      // canonical footnote and just need to tell them.
      let handled = false;
      const ack = () => { handled = true; };
      window.addEventListener('agenda:insert-footnote-ref-ack', ack, { once: true });
      window.dispatchEvent(new CustomEvent(AGENDA_INSERT_EVENT, { detail }));
      // Give listener a tick to ack synchronously.
      await new Promise((r) => setTimeout(r, 0));
      window.removeEventListener('agenda:insert-footnote-ref-ack', ack);
      if (!handled) {
        toast.success('Footnote saved', {
          description: 'Open the Agenda and click where you want to place the reference.',
        });
      } else {
        toast.success(mode === 'freetext' ? 'Inserted free text + footnote' : 'Inserted into Agenda');
      }
      return true;
    },
    [user?.id, company?.id, reportingPeriod],
  );
}
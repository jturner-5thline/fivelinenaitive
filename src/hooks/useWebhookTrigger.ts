import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

type EventType = 'INSERT' | 'UPDATE' | 'DELETE';

interface WebhookPayload {
  type: EventType;
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
  user_id: string;
  timestamp: string;
}

export function useWebhookTrigger() {
  const { user } = useAuth();

  const triggerWebhook = useCallback(async (
    table: string,
    type: EventType,
    record: Record<string, unknown> | null,
    oldRecord: Record<string, unknown> | null = null
  ) => {
    if (!user) return;

    const payload: WebhookPayload = {
      type,
      table,
      record,
      old_record: oldRecord,
      user_id: user.id,
      timestamp: new Date().toISOString(),
    };

    try {
      // Fire and forget - don't await to not block the main operation
      supabase.functions.invoke('webhook-sync', {
        body: payload,
      }).then(({ error }) => {
        if (error) {
          console.error('Webhook trigger failed:', error);
        }
      });
    } catch (error) {
      // Silent fail - webhooks should not block main operations
      console.error('Webhook trigger error:', error);
    }
  }, [user]);

  const triggerDealWebhook = useCallback((
    type: EventType,
    deal: Record<string, unknown> | null,
    oldDeal: Record<string, unknown> | null = null
  ) => {
    return triggerWebhook('deals', type, deal, oldDeal);
  }, [triggerWebhook]);

  const triggerLenderWebhook = useCallback((
    type: EventType,
    lender: Record<string, unknown> | null,
    oldLender: Record<string, unknown> | null = null
  ) => {
    return triggerWebhook('deal_lenders', type, lender, oldLender);
  }, [triggerWebhook]);

  return {
    triggerWebhook,
    triggerDealWebhook,
    triggerLenderWebhook,
  };
}

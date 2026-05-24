import { supabase } from '@/integrations/supabase/client';
import { trimTopic } from '@/lib/scheduleMeetingNotes';

/**
 * Thin wrapper around the existing `smart-email-ai` edge function's
 * `summarize_thread` action. Used by the Schedule Meeting NOTES composer
 * to produce a clean one-sentence Topic line (≤140 chars) instead of
 * dumping the raw email body.
 *
 * Returns null on any failure so callers can fall back to the email
 * subject — never throws, never blocks the UI.
 */
export async function summarizeThreadTopic(args: {
  dealId?: string | null;
  thread: { subject?: string | null; emails?: any[] };
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('smart-email-ai', {
      body: {
        action: 'summarize_thread',
        dealId: args.dealId || null,
        threadData: {
          subject: args.thread.subject || '',
          emails: (args.thread.emails || []).slice(-6), // keep payload small
        },
      },
    });
    if (error) return null;
    const summary: string | undefined = data?.result?.summary;
    if (!summary || typeof summary !== 'string') return null;
    // Take just the first sentence to keep the Topic line tight.
    const firstSentence = summary.split(/(?<=[.!?])\s+/)[0] || summary;
    return trimTopic(firstSentence, 140);
  } catch {
    return null;
  }
}
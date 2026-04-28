import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { EmailThread } from './mockEmailData';
import { toast } from 'sonner';

interface Props {
  thread: EmailThread;
  dealId?: string;
}

/**
 * Always-visible "Ask about this email…" prompt rendered inside the
 * AI Assist sidebar. Available even for unmatched emails so users can
 * query the AI without a linked deal. Uses the existing smart-email-ai
 * `summarize_thread` action with the user's question prepended as a
 * custom instruction — no new edge function required.
 */
export function EmailAskAiBox({ thread, dealId }: Props) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setAnswer(null);
    try {
      const { data, error } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'summarize_thread',
          dealId,
          threadData: {
            subject: thread.subject,
            threadId: thread.threadId,
            latestEmail: thread.latestEmail,
            emails: thread.emails.slice(0, 6).map((e) => ({
              from_name: e.from_name,
              from_email: e.from_email,
              received_at: e.received_at,
              body_preview: (e.body_preview || '').substring(0, 1500),
              snippet: e.snippet,
            })),
          },
          customInstructions: `Answer this question about the email instead of summarizing: "${q}". Reply in plain English (1–3 sentences). If you don't have enough info, say so.`,
        },
      });
      if (error) throw error;
      const text =
        data?.result?.summary ||
        data?.result?.raw ||
        (typeof data?.result === 'string' ? data.result : '') ||
        'No answer returned.';
      setAnswer(text);
    } catch (err: any) {
      toast.error("Couldn't reach AI — try again");
      setAnswer(null);
      // eslint-disable-next-line no-console
      console.warn('[EmailAskAiBox] failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-semibold tracking-wide text-foreground">
          Ask AI
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this email..."
          className="h-7 text-[12px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ask();
            }
          }}
          disabled={loading}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0 shrink-0"
          disabled={!question.trim() || loading}
          onClick={ask}
          aria-label="Ask"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </Button>
      </div>
      {answer && (
        <p className="text-[12px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
          {answer}
        </p>
      )}
    </div>
  );
}

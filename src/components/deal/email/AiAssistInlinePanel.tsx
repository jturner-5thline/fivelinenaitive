import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, X, Reply, Briefcase } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { EmailThread } from './mockEmailData';

interface AiAssistInlinePanelProps {
  thread: EmailThread;
  dealId?: string;
  onClose: () => void;
  onInsertReply?: (text: string) => void;
}

interface AiAssistResult {
  summary: string;
  suggestedReplies: string[];
  dealContext?: {
    dealName: string;
    stage: string;
    recentActivity?: string;
  } | null;
}

export function AiAssistInlinePanel({ thread, dealId, onClose, onInsertReply }: AiAssistInlinePanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latestEmail = thread.latestEmail;
      const threadContext = thread.emails.map(e => ({
        from: e.from_name,
        subject: e.subject,
        body: e.body_preview?.substring(0, 500),
        date: e.received_at,
      }));

      const prompt = `Analyze this email thread and provide a JSON response with exactly this structure:
{
  "summary": "A 2-3 sentence summary of the email thread",
  "suggestedReplies": ["reply option 1 (1-2 sentences)", "reply option 2 (1-2 sentences)", "reply option 3 (1-2 sentences)"],
  "dealContext": ${thread.dealName ? `{"dealName": "${thread.dealName}", "stage": "Active", "recentActivity": "Recent email exchange"}` : 'null'}
}

Email thread:
Subject: ${thread.subject}
${threadContext.map(e => `From: ${e.from} (${e.date})\n${e.body}`).join('\n---\n')}

Respond ONLY with valid JSON, no markdown fences.`;

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: { type: 'email_assist', dealId },
        }),
      });

      if (!resp.ok) throw new Error('AI request failed');

      // Read streamed response
      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      let fullText = '';
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullText += delta;
            } catch {}
          }
        }
      }

      // Try to parse the JSON from the AI response
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setResult({
          summary: parsed.summary || 'Unable to generate summary.',
          suggestedReplies: parsed.suggestedReplies || [],
          dealContext: parsed.dealContext || null,
        });
      } else {
        // Fallback: use the text as summary
        setResult({
          summary: fullText.substring(0, 300),
          suggestedReplies: [],
          dealContext: null,
        });
      }
      setHasRun(true);
    } catch (err: any) {
      console.error('AI Assist error:', err);
      setError('Failed to analyze email. Please try again.');
      // Fallback with mock data
      setResult({
        summary: `This thread discusses "${thread.subject}" between ${thread.participants.join(', ')}. The latest message ${thread.needsResponse ? 'requires a response' : 'is informational'}.`,
        suggestedReplies: [
          'Thank you for the update. I\'ll review and get back to you shortly.',
          'Understood. Let me loop in the relevant team members on this.',
          'Thanks for sending this over. Could we schedule a quick call to discuss further?',
        ],
        dealContext: thread.dealName ? { dealName: thread.dealName, stage: 'Active', recentActivity: 'Email thread activity' } : null,
      });
      setHasRun(true);
      setError(null); // Clear error since we have fallback
    } finally {
      setLoading(false);
    }
  }, [thread, dealId]);

  // Auto-run on mount
  useEffect(() => {
    if (!hasRun && !loading) {
      runAnalysis();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // Native naitive widget shell — same `rounded-xl` radius and surface
    // language as dashboard tiles (see DashboardGrid / DailyBriefingModal),
    // with a refined on-brand blue border so the AI Assist module reads
    // clearly as its own widget inside the email popup.
    <div className="mx-4 mb-3 rounded-xl border border-primary/40 bg-card/60 backdrop-blur overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/20">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">AI Assist</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Analyzing email thread...</span>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive text-center py-2">{error}</div>
        )}

        {result && !loading && (
          <>
            {/* Summary */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
              <p className="text-xs leading-relaxed text-foreground/90">{result.summary}</p>
            </div>

            {/* Deal Context */}
            {result.dealContext && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/30">
                <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium">{result.dealContext.dealName}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">Stage: {result.dealContext.stage}</span>
                </div>
                {result.dealContext.recentActivity && (
                  <Badge variant="outline" className="text-[9px] h-4 shrink-0">{result.dealContext.recentActivity}</Badge>
                )}
              </div>
            )}

            {/* Suggested Replies */}
            {result.suggestedReplies.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Quick Replies</p>
                <div className="space-y-1.5">
                  {result.suggestedReplies.map((reply, i) => (
                    <button
                      key={i}
                      onClick={() => onInsertReply?.(reply)}
                      className="w-full text-left px-3 py-2 rounded-md border border-border/40 bg-card/40 hover:bg-primary/5 hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-start gap-2">
                        <Reply className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary" />
                        <span className="text-xs leading-relaxed text-foreground/80 group-hover:text-foreground">{reply}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Regenerate */}
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={runAnalysis}>
              <Sparkles className="h-3 w-3" /> Regenerate
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

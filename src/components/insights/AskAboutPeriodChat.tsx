import { useMemo, useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageCircleQuestion, Send, Sparkles, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import {
  formatDeltaValue,
  useInsightsComparison,
  type DeltaResult,
  type TrendAlert,
} from '@/hooks/useInsightsComparison';
import { useInsightsDrivers } from '@/hooks/useInsightsDrivers';
import { useInsightsForecast } from '@/hooks/useInsightsForecast';
import { useInsightsTargets } from '@/hooks/useInsightsTargets';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { format, parseISO } from 'date-fns';

type ChatRole = 'user' | 'assistant';
interface ChatMsg {
  id: string;
  role: ChatRole;
  content: string;
}

const SUGGESTIONS = [
  'What were the biggest movers this period?',
  'Why did revenue change MoM?',
  'Which metrics are off plan?',
  'What should leadership focus on next month?',
];

function buildSystemPrompt(
  deltas: DeltaResult[],
  alerts: TrendAlert[],
  periodLabel: string,
  drivers: Record<string, { contributors: { name: string; delta: number }[] }> | undefined,
  forecasts: { label: string; current: number; nextProjection: number; band: number; format: DeltaResult['format'] }[],
  targets: { label: string; target: number; current: number; format: DeltaResult['format'] }[],
) {
  const metricLines = deltas.map(d => {
    const cur = formatDeltaValue(d.current, d.format);
    const prev = formatDeltaValue(d.prevPeriod, d.format);
    const yoy = formatDeltaValue(d.prevYear, d.format);
    const mom = d.pctMoM == null ? 'n/a' : `${d.pctMoM.toFixed(1)}%`;
    const yoyPct = d.pctYoY == null ? 'n/a' : `${d.pctYoY.toFixed(1)}%`;
    return `- ${d.label}: current ${cur}, prior ${prev} (MoM ${mom}, Δ ${formatDeltaValue(d.changeMoM, d.format)}), prior year ${yoy} (YoY ${yoyPct}, Δ ${formatDeltaValue(d.changeYoY, d.format)}). Higher is ${d.goodWhen === 'up' ? 'better' : 'worse'}.`;
  });
  const alertLines = alerts.length
    ? alerts.map(a => `- [${a.level.toUpperCase()}] ${a.metric}: ${a.message}`).join('\n')
    : '- None';
  const driverLines: string[] = [];
  if (drivers) {
    for (const [k, b] of Object.entries(drivers)) {
      if (!b.contributors.length) continue;
      const top = b.contributors.slice(0, 5)
        .map(c => `${c.name} (${c.delta >= 0 ? '+' : ''}${formatDeltaValue(c.delta, 'currency')})`)
        .join(', ');
      driverLines.push(`- ${k}: ${top}`);
    }
  }
  const fcLines = forecasts.map(f =>
    `- ${f.label}: current ${formatDeltaValue(f.current, f.format)}, next-period projection ${formatDeltaValue(f.nextProjection, f.format)} (±${formatDeltaValue(f.band, f.format)})`,
  );
  const tgLines = targets.map(t => {
    const variance = t.current - t.target;
    return `- ${t.label}: actual ${formatDeltaValue(t.current, t.format)} vs plan ${formatDeltaValue(t.target, t.format)} (Δ ${variance >= 0 ? '+' : ''}${formatDeltaValue(variance, t.format)})`;
  });

  return `You are the naitive Insights analyst answering questions about the current reporting period.

Reporting period: ${periodLabel}

METRIC DELTAS (current vs prior period vs prior year):
${metricLines.join('\n')}

TREND ALERTS:
${alertLines}
${driverLines.length ? `\nTOP DRIVERS (largest contributors to MoM change):\n${driverLines.join('\n')}` : ''}
${fcLines.length ? `\nFORECASTS (linear, trailing 6mo):\n${fcLines.join('\n')}` : ''}
${tgLines.length ? `\nPLAN VARIANCE:\n${tgLines.join('\n')}` : ''}

RULES:
- Only use the data above. Do NOT invent metrics, deals, customers, or numbers not present.
- Always cite specific deltas inline (e.g. "Total Revenue −12.4% MoM (−$184k)").
- Reference driver names verbatim when explaining causes.
- If the dataset cannot answer the question, say so plainly.
- Be concise: under 180 words unless the user asks for detail. Use short markdown bullets when listing 3+ items.`;
}

export function AskAboutPeriodChat() {
  const { deltas, alerts, periodLabel, isLoading } = useInsightsComparison();
  const { drivers } = useInsightsDrivers();
  const { forecasts } = useInsightsForecast();
  const { data: targetRows } = useInsightsTargets();
  const tf = useInsightsTimeframeOptional();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const targetsForPrompt = useMemo(() => {
    if (!targetRows?.length) return [];
    // Anchor target lookup to the selected Reporting period (timeframe end),
    // not the wall-clock month — otherwise viewing Q1 2026 would still match
    // targets for the current month.
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : new Date();
    const monthKey = format(anchor, 'yyyy-MM');
    const map = new Map<string, { target: number; label: string }>();
    for (const t of targetRows) {
      const exact = t.period_month === monthKey;
      const def = !t.period_month;
      if (exact || (def && !map.has(t.metric_key))) {
        map.set(t.metric_key, { target: Number(t.target_value), label: t.metric_label });
      }
    }
    return deltas
      .filter(d => map.has(d.key))
      .map(d => ({ label: map.get(d.key)!.label, target: map.get(d.key)!.target, current: d.current, format: d.format }));
  }, [targetRows, deltas, tf?.timeframe.end]);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(
      deltas,
      alerts,
      periodLabel,
      drivers,
      forecasts.map(f => ({ label: f.label, current: f.current, nextProjection: f.nextProjection, band: f.band, format: f.format })),
      targetsForPrompt,
    ),
    [deltas, alerts, periodLabel, drivers, forecasts, targetsForPrompt],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    if (!deltas.length) {
      toast.error('No metric data loaded for this period yet');
      return;
    }
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const resp = await sendClaudeMessage({
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n---\nUser question: ${text}` },
          ...next.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: text },
        ],
        context: 'chat',
        usage: { feature_subtype: 'insights_ask_about_period' },
        requestManager: { panelKey: 'insights:ask-about-period' },
      });
      if (isStaleClaudeResponse(resp)) return;
      if (!resp.success) throw new Error(resp.error || 'AI failed');
      setMessages(m => [
        ...m,
        { id: crypto.randomUUID(), role: 'assistant', content: resp.response.trim() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to answer';
      toast.error(msg);
      setMessages(m => [
        ...m,
        { id: crypto.randomUUID(), role: 'assistant', content: `_Error: ${msg}_` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-primary" />
            Ask about this period
            <Badge variant="outline" className="ml-1 text-[10px]">{periodLabel}</Badge>
          </CardTitle>
          {messages.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setMessages([])}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[320px] rounded-lg border border-border/50 bg-muted/20 p-3">
          <div ref={scrollerRef} className="space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  Ask anything about the current dataset — answers reference specific deltas, drivers,
                  alerts, plan variance, and forecasts.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={busy || isLoading}
                      className="text-[11px] rounded-full border border-border/60 bg-background px-2.5 py-1 hover:bg-accent disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => (
              <div
                key={m.id}
                className={cn(
                  'flex gap-2 text-sm',
                  m.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {m.role === 'assistant' && (
                  <div className="h-6 w-6 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 max-w-[85%] leading-relaxed',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border border-border/60',
                  )}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="h-6 w-6 shrink-0 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g. Why did total revenue drop this month?"
            rows={2}
            className="resize-none text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
          />
          <Button onClick={() => send()} disabled={busy || !input.trim() || isLoading}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
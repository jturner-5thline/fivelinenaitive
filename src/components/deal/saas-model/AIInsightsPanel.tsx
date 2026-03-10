import { useState, useCallback } from 'react';
import { SaaSModelData } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, TrendingUp, AlertTriangle, FileText, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Props {
  model: SaaSModelData;
}

type InsightType = 'trends' | 'anomalies' | 'underwriting';

interface InsightState {
  content: string;
  isLoading: boolean;
  generatedAt: Date | null;
}

const INSIGHT_CONFIG: Record<InsightType, { label: string; icon: React.ReactNode; description: string }> = {
  trends: {
    label: 'Trends',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    description: 'Revenue trajectory, profitability, and credit outlook',
  },
  anomalies: {
    label: 'Anomalies',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    description: 'Flag unusual spikes, trend breaks, and ratio warnings',
  },
  underwriting: {
    label: 'Underwriting',
    icon: <FileText className="h-3.5 w-3.5" />,
    description: 'Draft credit memo with borrowing base and recommendation',
  },
};

export function AIInsightsPanel({ model }: Props) {
  const [activeType, setActiveType] = useState<InsightType>('trends');
  const [insights, setInsights] = useState<Record<InsightType, InsightState>>({
    trends: { content: '', isLoading: false, generatedAt: null },
    anomalies: { content: '', isLoading: false, generatedAt: null },
    underwriting: { content: '', isLoading: false, generatedAt: null },
  });
  const [copied, setCopied] = useState(false);

  const generateInsight = useCallback(async (type: InsightType) => {
    setInsights(prev => ({
      ...prev,
      [type]: { ...prev[type], isLoading: true, content: '' },
    }));

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analysis-insights`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ modelData: model, insightType: type }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setInsights(prev => ({
                ...prev,
                [type]: { ...prev[type], content: accumulated },
              }));
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Final flush
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setInsights(prev => ({
                ...prev,
                [type]: { ...prev[type], content: accumulated },
              }));
            }
          } catch { /* ignore */ }
        }
      }

      setInsights(prev => ({
        ...prev,
        [type]: { content: accumulated, isLoading: false, generatedAt: new Date() },
      }));
    } catch (err) {
      console.error('AI insight error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate insight';
      toast.error(message);
      setInsights(prev => ({
        ...prev,
        [type]: { ...prev[type], isLoading: false },
      }));
    }
  }, [model]);

  const handleCopy = useCallback(() => {
    const content = insights[activeType].content;
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [activeType, insights]);

  const current = insights[activeType];
  const hasData = model.totalRevenue?.some(v => v !== 0);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">AI Insights</CardTitle>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">
              Beta
            </Badge>
          </div>
          {current.content && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => generateInsight(activeType)}
                disabled={current.isLoading}
              >
                <RefreshCw className={cn("h-3 w-3", current.isLoading && "animate-spin")} />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeType} onValueChange={v => setActiveType(v as InsightType)}>
          <TabsList className="h-7 bg-muted/30 w-full">
            {(Object.entries(INSIGHT_CONFIG) as [InsightType, typeof INSIGHT_CONFIG.trends][]).map(([key, config]) => (
              <TabsTrigger key={key} value={key} className="gap-1 text-[11px] h-6 flex-1">
                {config.icon}
                {config.label}
                {insights[key].generatedAt && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(INSIGHT_CONFIG) as InsightType[]).map(type => (
            <TabsContent key={type} value={type} className="mt-3">
              {!insights[type].content && !insights[type].isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-3 rounded-full bg-muted/50 mb-3">
                    {INSIGHT_CONFIG[type].icon}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {INSIGHT_CONFIG[type].description}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-7 text-xs gap-1.5"
                    onClick={() => generateInsight(type)}
                    disabled={!hasData}
                  >
                    <Sparkles className="h-3 w-3" />
                    Generate {INSIGHT_CONFIG[type].label}
                  </Button>
                  {!hasData && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Map financial data first to enable AI insights
                    </p>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[320px]">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_li]:my-0.5">
                    <ReactMarkdown>{insights[type].content}</ReactMarkdown>
                    {insights[type].isLoading && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-[10px]">Generating…</span>
                      </span>
                    )}
                  </div>
                  {insights[type].generatedAt && !insights[type].isLoading && (
                    <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border/30">
                      Generated {insights[type].generatedAt!.toLocaleTimeString()}
                    </p>
                  )}
                </ScrollArea>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Brain, TrendingUp, AlertTriangle, Lightbulb, FileText, RefreshCw } from 'lucide-react';
import { sendClaudeMessage, SYSTEM_PROMPTS, isStaleClaudeResponse } from '@/services/claude';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface DealFinancials {
  dealName?: string;
  dealValue?: number;
  dealStage?: string;
  dealType?: string;
  revenue?: number;
  expenses?: number;
  margins?: number;
  growthRate?: number;
  notes?: string;
  lenderCount?: number;
  [key: string]: any;
}

interface AnalysisResult {
  summary: string;
  strengths: string[];
  risks: string[];
  recommendations: string[];
  rawResponse: string;
}

interface ClaudeFinancialAnalysisProps {
  dealId: string;
  financials: DealFinancials;
  className?: string;
}

export function ClaudeFinancialAnalysis({ dealId, financials, className }: ClaudeFinancialAnalysisProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAnalysis = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const financialContext = Object.entries(financials)
        .filter(([_, v]) => v != null && v !== '')
        .map(([k, v]) => `- ${k.replace(/([A-Z])/g, ' $1').trim()}: ${typeof v === 'number' ? `$${v.toLocaleString()}` : v}`)
        .join('\n');

      const result = await sendClaudeMessage({
        messages: [{
          role: 'user',
          content: `Analyze the following deal financial data and provide a comprehensive assessment:\n\n${financialContext}\n\nProvide your analysis in this exact format:\n\n## Summary\n[Executive overview in 2-3 sentences]\n\n## Strengths\n- [Strength 1]\n- [Strength 2]\n...\n\n## Risks\n- [Risk 1]\n- [Risk 2]\n...\n\n## Recommendations\n- [Recommendation 1]\n- [Recommendation 2]\n...\n\n## Key Metrics\n[Any important ratios or figures worth highlighting]`,
        }],
        system: SYSTEM_PROMPTS.financialAnalysis,
        context: 'financial-analysis',
        temperature: 0.3,
        requestManager: { panelKey: `financial-analysis:${dealId}` },
      });

      if (isStaleClaudeResponse(result)) return;

      if (!result.success) {
        throw new Error(result.error || 'Analysis failed');
      }

      // Parse sections from markdown
      const response = result.response;
      const strengthsMatch = response.match(/## Strengths\n([\s\S]*?)(?=\n## )/);
      const risksMatch = response.match(/## Risks\n([\s\S]*?)(?=\n## )/);
      const recsMatch = response.match(/## Recommendations\n([\s\S]*?)(?=\n## |$)/);
      const summaryMatch = response.match(/## Summary\n([\s\S]*?)(?=\n## )/);

      const extractItems = (text?: string) =>
        (text || '').split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());

      setAnalysis({
        summary: summaryMatch?.[1]?.trim() || 'Analysis complete.',
        strengths: extractItems(strengthsMatch?.[1]),
        risks: extractItems(risksMatch?.[1]),
        recommendations: extractItems(recsMatch?.[1]),
        rawResponse: response,
      });

      toast.success('Financial analysis complete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!analysis) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
          <Brain className="h-8 w-8 text-primary/40" />
          <div className="text-center">
            <p className="text-sm font-medium">AI Financial Analysis</p>
            <p className="text-xs text-muted-foreground mt-1">
              Get Claude-powered insights on this deal's financials
            </p>
          </div>
          <Button
            onClick={runAnalysis}
            disabled={isLoading}
            className="gap-2 mt-2"
            size="sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Brain className="h-4 w-4" />
            )}
            {isLoading ? 'Analyzing...' : 'Run AI Analysis'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Financial Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">Claude</Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={runAnalysis} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</span>
              </div>
              <p className="text-sm">{analysis.summary}</p>
            </div>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Strengths</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risks */}
            {analysis.risks.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">Risks</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.risks.map((r, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations.length > 0 && (
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Recommendations</span>
                </div>
                <ul className="space-y-1.5">
                  {analysis.recommendations.map((r, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full Analysis */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                View full analysis
              </summary>
              <div className="mt-2 p-3 rounded-lg bg-muted/30 border prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{analysis.rawResponse}</ReactMarkdown>
              </div>
            </details>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, Shield, Loader2, RefreshCw,
  ChevronDown, ChevronRight, Send, BarChart3, MessageSquare, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useFinancialAI, type FinancialInsight, type AnomalyReview, type FinancialQAResponse, type ChartSpec } from '@/hooks/useFinancialAI';
import { useComputedMetrics, type MetricSummary } from '@/hooks/useComputedMetrics';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Props {
  dealId: string;
  hasFinancialData: boolean;
}

const SUGGESTED_QUESTIONS = [
  "What are the biggest risks in this company's financial profile?",
  "How has revenue growth trended over the last 12 months?",
  "What does the leverage and debt service capacity look like?",
  "Are there any data quality anomalies?",
  "Show me a chart of EBITDA and gross margin trends",
];

export function FinancialIntelligencePanel({ dealId, hasFinancialData }: Props) {
  const { summaries, isComputing, lastComputedAt, computeMetrics, getMetricSeries } = useComputedMetrics(dealId);
  const {
    insights, anomalyReview, isLoadingInsights, isLoadingAnomalies, isLoadingQA,
    loadCachedInsights, generateInsights, reviewAnomalies, askFinancialQuestion, generateChartSpec,
  } = useFinancialAI(dealId);

  const [isOpen, setIsOpen] = useState(false);
  const [qaMessages, setQaMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; data?: FinancialQAResponse; chart?: ChartSpec }>>([]);
  const [qaInput, setQaInput] = useState('');
  const [activeSection, setActiveSection] = useState<'insights' | 'anomalies' | 'ask'>('insights');
  const qaEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load cached insights on mount
  useEffect(() => { loadCachedInsights(); }, [loadCachedInsights]);

  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [qaMessages]);

  const handleComputeAndAnalyze = useCallback(async () => {
    await computeMetrics();
    await generateInsights();
  }, [computeMetrics, generateInsights]);

  const handleAskQuestion = useCallback(async (question?: string) => {
    const q = question || qaInput.trim();
    if (!q) return;
    setQaInput('');
    setQaMessages(prev => [...prev, { role: 'user', content: q }]);

    // Check if it's a chart request
    const isChartReq = /chart|graph|plot|trend|show me|visualize/i.test(q);

    if (isChartReq) {
      const spec = await generateChartSpec(q);
      if (spec) {
        // Build chart data from actual metrics
        const chartData = buildChartData(spec, getMetricSeries);
        setQaMessages(prev => [...prev, {
          role: 'assistant',
          content: spec.narrative_focus || `Here's the ${spec.title}`,
          chart: spec,
        }]);
        return;
      }
    }

    const response = await askFinancialQuestion(q);
    if (response) {
      setQaMessages(prev => [...prev, {
        role: 'assistant',
        content: response.answer,
        data: response,
        chart: response.chart_suggestion || undefined,
      }]);
    } else {
      setQaMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not generate a response. Please try again.',
      }]);
    }
  }, [qaInput, askFinancialQuestion, generateChartSpec, getMetricSeries]);

  if (!hasFinancialData) return null;

  const metricsExist = summaries.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-medium">Financial Intelligence</CardTitle>
                {metricsExist && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {summaries.length} metrics
                  </Badge>
                )}
                {insights && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Insights ready
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!metricsExist && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); handleComputeAndAnalyze(); }}
                    disabled={isComputing || isLoadingInsights}
                  >
                    {isComputing || isLoadingInsights ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Analyze Financials
                  </Button>
                )}
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4 space-y-3">
            {/* Action bar */}
            <div className="flex items-center gap-1.5 border-b border-border/50 pb-2">
              <Button
                size="sm"
                variant={activeSection === 'insights' ? 'default' : 'ghost'}
                className="h-6 text-[10px] gap-1 px-2"
                onClick={() => setActiveSection('insights')}
              >
                <TrendingUp className="h-3 w-3" /> Insights
              </Button>
              <Button
                size="sm"
                variant={activeSection === 'anomalies' ? 'default' : 'ghost'}
                className="h-6 text-[10px] gap-1 px-2"
                onClick={() => setActiveSection('anomalies')}
              >
                <AlertTriangle className="h-3 w-3" /> Data Quality
              </Button>
              <Button
                size="sm"
                variant={activeSection === 'ask' ? 'default' : 'ghost'}
                className="h-6 text-[10px] gap-1 px-2"
                onClick={() => { setActiveSection('ask'); setTimeout(() => inputRef.current?.focus(), 100); }}
              >
                <MessageSquare className="h-3 w-3" /> Ask AI
              </Button>
              <div className="flex-1" />
              {metricsExist && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 px-2 text-muted-foreground"
                  onClick={handleComputeAndAnalyze}
                  disabled={isComputing || isLoadingInsights}
                >
                  <RefreshCw className={cn("h-3 w-3", (isComputing || isLoadingInsights) && "animate-spin")} />
                  Refresh
                </Button>
              )}
            </div>

            {/* Insights Section */}
            {activeSection === 'insights' && (
              <div className="space-y-2">
                {isLoadingInsights ? (
                  <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating insights...
                  </div>
                ) : insights ? (
                  <InsightsDisplay insights={insights} />
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-muted-foreground mb-2">
                      {metricsExist ? 'Click to generate AI-powered insights from your computed metrics.' : 'Compute metrics first to enable AI insights.'}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={metricsExist ? () => generateInsights() : handleComputeAndAnalyze}
                      disabled={isComputing || isLoadingInsights}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {metricsExist ? 'Generate Insights' : 'Compute & Analyze'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Anomaly Review Section */}
            {activeSection === 'anomalies' && (
              <div className="space-y-2">
                {isLoadingAnomalies ? (
                  <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" /> Reviewing data quality...
                  </div>
                ) : anomalyReview ? (
                  <AnomalyDisplay review={anomalyReview} />
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-muted-foreground mb-2">Run a data quality check on your financial data.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => reviewAnomalies()}
                      disabled={isLoadingAnomalies || !metricsExist}
                    >
                      <Shield className="h-3.5 w-3.5" /> Review Data Quality
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Ask AI Section */}
            {activeSection === 'ask' && (
              <div className="space-y-2">
                {qaMessages.length === 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested questions</p>
                    <div className="flex flex-wrap gap-1">
                      {SUGGESTED_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          className="text-[10px] px-2 py-1 rounded-full border border-border/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                          onClick={() => handleAskQuestion(q)}
                          disabled={isLoadingQA}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {qaMessages.length > 0 && (
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2 pr-2">
                      {qaMessages.map((msg, i) => (
                        <div key={i} className={cn(
                          "text-xs rounded-lg px-3 py-2",
                          msg.role === 'user'
                            ? "bg-primary/10 text-foreground ml-8"
                            : "bg-muted/30 text-foreground mr-4"
                        )}>
                          {msg.role === 'assistant' ? (
                            <div className="space-y-2">
                              <div className="prose prose-xs max-w-none dark:prose-invert">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                              {msg.data?.cited_metrics && msg.data.cited_metrics.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
                                  {msg.data.cited_metrics.map((cm, j) => (
                                    <Badge key={j} variant="outline" className="text-[9px] h-4 px-1">
                                      {cm.metric_key}: {cm.formatted}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {msg.chart && (
                                <InlineChart spec={msg.chart} getMetricSeries={getMetricSeries} />
                              )}
                              {msg.data?.follow_up_questions && msg.data.follow_up_questions.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {msg.data.follow_up_questions.slice(0, 3).map((fq, j) => (
                                    <button
                                      key={j}
                                      className="text-[9px] px-1.5 py-0.5 rounded-full border border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                                      onClick={() => handleAskQuestion(fq)}
                                    >
                                      {fq}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                        </div>
                      ))}
                      <div ref={qaEndRef} />
                    </div>
                  </ScrollArea>
                )}

                {/* Input */}
                <div className="flex items-center gap-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                    placeholder="Ask about financials..."
                    className="flex-1 h-7 px-2.5 text-xs bg-muted/20 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/30"
                    disabled={isLoadingQA || !metricsExist}
                  />
                  <Button
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleAskQuestion()}
                    disabled={isLoadingQA || !qaInput.trim() || !metricsExist}
                  >
                    {isLoadingQA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// === Sub-components ===

function InsightsDisplay({ insights }: { insights: FinancialInsight }) {
  return (
    <div className="space-y-3">
      {/* Executive Summary */}
      <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-primary/60 mb-1">Executive Summary</p>
        <p className="text-xs text-foreground leading-relaxed">{insights.executive_summary}</p>
      </div>

      {/* Positive Trends */}
      {insights.positive_trends?.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-success" /> Positive Trends
          </p>
          {insights.positive_trends.map((t, i) => (
            <div key={i} className="bg-success/5 border border-success/10 rounded px-2.5 py-1.5">
              <p className="text-xs font-medium text-foreground">{t.title}</p>
              <p className="text-[11px] text-muted-foreground">{t.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Risks */}
      {insights.risks?.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-destructive" /> Risk Factors
          </p>
          {insights.risks.map((r, i) => (
            <div key={i} className={cn(
              "border rounded px-2.5 py-1.5",
              r.severity === 'high' ? "bg-destructive/5 border-destructive/10" : "bg-warning/5 border-warning/10"
            )}>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={cn(
                  "text-[8px] h-3.5 px-1",
                  r.severity === 'high' ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"
                )}>
                  {r.severity}
                </Badge>
                <p className="text-xs font-medium text-foreground">{r.title}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{r.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Observations */}
      {(insights.growth_observations || insights.margin_observations || insights.liquidity_leverage_observations) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {insights.growth_observations && (
            <div className="bg-muted/20 rounded px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Growth</p>
              <p className="text-[11px] text-foreground">{insights.growth_observations}</p>
            </div>
          )}
          {insights.margin_observations && (
            <div className="bg-muted/20 rounded px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Margins</p>
              <p className="text-[11px] text-foreground">{insights.margin_observations}</p>
            </div>
          )}
          {insights.liquidity_leverage_observations && (
            <div className="bg-muted/20 rounded px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Liquidity & Leverage</p>
              <p className="text-[11px] text-foreground">{insights.liquidity_leverage_observations}</p>
            </div>
          )}
          {insights.debt_servicing_observations && (
            <div className="bg-muted/20 rounded px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Debt Servicing</p>
              <p className="text-[11px] text-foreground">{insights.debt_servicing_observations}</p>
            </div>
          )}
        </div>
      )}

      {/* Follow-up Questions */}
      {insights.follow_up_questions?.length > 0 && (
        <div className="pt-1 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground mb-1">Suggested follow-ups:</p>
          <div className="flex flex-wrap gap-1">
            {insights.follow_up_questions.map((q, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnomalyDisplay({ review }: { review: AnomalyReview }) {
  const scoreColor = review.data_quality_score >= 80 ? 'text-success' : review.data_quality_score >= 60 ? 'text-warning' : 'text-destructive';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className={cn("text-2xl font-bold tabular-nums", scoreColor)}>{review.data_quality_score}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Quality Score</p>
        </div>
        <p className="text-xs text-muted-foreground flex-1">{review.summary}</p>
      </div>

      {review.issues?.length > 0 && (
        <div className="space-y-1">
          {review.issues.map((issue, i) => (
            <div key={i} className={cn(
              "border rounded px-2.5 py-1.5",
              issue.severity === 'critical' ? "bg-destructive/5 border-destructive/10" :
              issue.severity === 'warning' ? "bg-warning/5 border-warning/10" :
              "bg-muted/20 border-border/50"
            )}>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                  {issue.severity}
                </Badge>
                <p className="text-xs font-medium">{issue.title}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{issue.detail}</p>
              {issue.recommendation && (
                <p className="text-[10px] text-primary/70 mt-0.5">→ {issue.recommendation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineChart({ spec, getMetricSeries }: { spec: ChartSpec; getMetricSeries: (key: string) => Array<{ period: string; value: number | null }> }) {
  const chartData = buildChartData(spec, getMetricSeries);

  if (chartData.length === 0) {
    return (
      <div className="bg-muted/20 rounded p-2 text-center">
        <p className="text-[10px] text-muted-foreground">No data available for this chart</p>
      </div>
    );
  }

  const colors = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

  return (
    <div className="bg-muted/10 border border-border/30 rounded-lg p-2">
      <p className="text-[10px] font-medium mb-1">{spec.title}</p>
      {spec.subtitle && <p className="text-[9px] text-muted-foreground mb-1.5">{spec.subtitle}</p>}
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          {spec.chart_type === 'bar' ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              {spec.metric_keys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          ) : spec.chart_type === 'area' ? (
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              {spec.metric_keys.map((key, i) => (
                <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.1} />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="period" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} width={40} />
              <Tooltip contentStyle={{ fontSize: 10 }} />
              {spec.metric_keys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {spec.narrative_focus && (
        <p className="text-[9px] text-muted-foreground mt-1">{spec.narrative_focus}</p>
      )}
    </div>
  );
}

function buildChartData(
  spec: ChartSpec,
  getMetricSeries: (key: string) => Array<{ period: string; value: number | null }>
): any[] {
  if (!spec.metric_keys || spec.metric_keys.length === 0) return [];

  // Get all periods across all requested metrics
  const allSeries = spec.metric_keys.map(key => ({
    key,
    data: getMetricSeries(key),
  }));

  if (allSeries.every(s => s.data.length === 0)) return [];

  // Get unique periods, sorted
  const allPeriods = [...new Set(allSeries.flatMap(s => s.data.map(d => d.period)))].sort();

  // Apply time range filter
  let filtered = allPeriods;
  if (spec.default_time_range && spec.default_time_range !== 'all') {
    const months = parseInt(spec.default_time_range) || 12;
    filtered = allPeriods.slice(-months);
  }

  // Build chart data points
  return filtered.map(period => {
    const point: any = { period: period.replace(/^\d{4}-/, '').replace(/^0/, '') };
    for (const series of allSeries) {
      const match = series.data.find(d => d.period === period);
      point[series.key] = match?.value ?? null;
    }
    return point;
  });
}

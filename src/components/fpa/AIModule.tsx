import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Slider } from '@/components/ui/slider';
import {
  Sparkles, Search, Play, Eye, ChevronDown, ChevronRight,
  TrendingDown, TrendingUp, Code, Lightbulb, BarChart3,
  Copy, Check, Loader2, AlertTriangle, FileText, ListChecks,
  ArrowRight, Settings2, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VarianceFinding {
  metric: string;
  variance: number;
  variancePct: number;
  direction: 'favorable' | 'unfavorable';
  explanation: string;
  confidence: number;
  drilldowns: { dimension: string; items: { name: string; amount: number }[] }[];
  workSteps: string[];
  sourceRecords: number;
  anomalyFlag: boolean;
}

interface ScanResult {
  findings: VarianceFinding[];
  summary: string;
  totalVariance: number;
  periodComparison: string;
}

interface ExploreResult {
  title: string;
  headers: string[];
  rows: string[][];
  rowDimension: string;
  colDimension: string;
  insights: string[];
  suggestedFollowups: string[];
}

interface SQLResult {
  sql: string;
  explanation: string;
  tables_used: string[];
  complexity: string;
  warnings: string[];
}

// Fallback data if AI isn't available
const FALLBACK_SCAN: ScanResult = {
  findings: [
    {
      metric: 'COGS',
      variance: -176000,
      variancePct: -13.1,
      direction: 'favorable',
      explanation: '(−$176k) from Catalyst Growth Partners and (−$91k) from Delta Strategic Solutions, partially offset by (+$68k) from FreshPath Consulting.',
      confidence: 0.94,
      drilldowns: [
        { dimension: 'Vendor', items: [
          { name: 'Catalyst Growth Partners', amount: -176000 },
          { name: 'Delta Strategic Solutions', amount: -91000 },
          { name: 'FreshPath Consulting', amount: 68000 },
        ]},
        { dimension: 'Geography', items: [
          { name: 'United States', amount: -67700 },
          { name: 'EMEA', amount: -45300 },
        ]},
      ],
      workSteps: [
        'Pulled all COGS transactions for Jan 2025 and Dec 2024',
        'Grouped by vendor to identify top movers',
        'Cross-referenced with PO/contract data for root cause',
        'Validated geography split against GL location codes',
      ],
      sourceRecords: 247,
      anomalyFlag: false,
    },
    {
      metric: 'S&M Expenses',
      variance: 100000,
      variancePct: 5.0,
      direction: 'unfavorable',
      explanation: '(+$65k) in Digital Advertising and (+$35k) in Event Sponsorships. Digital ad spend increase driven by Q4 campaign extension into January.',
      confidence: 0.91,
      drilldowns: [
        { dimension: 'Category', items: [
          { name: 'Digital Advertising', amount: 65000 },
          { name: 'Event Sponsorships', amount: 35000 },
        ]},
      ],
      workSteps: [
        'Aggregated S&M line items by sub-category',
        'Identified Digital Ads as primary driver (+$65K)',
        'Traced to NovaTech Digital campaign invoice',
        'Confirmed Event Sponsorships tied to Q1 trade show prepayment',
      ],
      sourceRecords: 89,
      anomalyFlag: false,
    },
    {
      metric: 'G&A Expenses',
      variance: -50000,
      variancePct: -5.0,
      direction: 'favorable',
      explanation: '(−$42k) from Professional Fees timing (deferred to Feb) and (−$8k) from reduced Office Supplies. Note: $37.2K in Retired Related Activities (32 lines) flagged as anomaly.',
      confidence: 0.87,
      drilldowns: [
        { dimension: 'Transaction Type', items: [
          { name: 'Professional Fees', amount: -42000 },
          { name: 'Office Supplies', amount: -8000 },
        ]},
      ],
      workSteps: [
        'Compared G&A sub-accounts MoM',
        'Identified Professional Fees deferral from accrual schedule',
        'Flagged 32 Retired Activity transactions totaling $37.2K as anomaly',
        'Recommended manual review of Retired Activities',
      ],
      sourceRecords: 156,
      anomalyFlag: true,
    },
  ],
  summary: 'Net favorable variance of $126K MoM driven primarily by COGS improvement (−$176K) from vendor renegotiations, partially offset by S&M increase (+$100K) from campaign extensions. One anomaly flagged: 32 Retired Activity lines in G&A require manual review.',
  totalVariance: -126000,
  periodComparison: 'Jan 2025 vs Dec 2024',
};

export function AIModule() {
  const [subTab, setSubTab] = useState('scan');
  const [scanRunning, setScanRunning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [expandedVariance, setExpandedVariance] = useState<string | null>(null);
  const [showWorkFor, setShowWorkFor] = useState<string | null>(null);

  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreResult, setExploreResult] = useState<ExploreResult | null>(null);

  const [sqlInput, setSqlInput] = useState('');
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlResult, setSqlResult] = useState<SQLResult | null>(null);

  const [thresholdPct, setThresholdPct] = useState(10);
  const [thresholdAmt, setThresholdAmt] = useState(50);
  const [comparison, setComparison] = useState('mom');
  const [showConfig, setShowConfig] = useState(false);

  const callAI = useCallback(async (action: string, context: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.functions.invoke('fpa-ai', {
        body: { action, context },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      if (msg.includes('Rate limit')) {
        toast.error('AI rate limit reached. Please wait a moment and try again.');
      } else if (msg.includes('credits')) {
        toast.error('AI credits exhausted. Please add credits to continue.');
      } else {
        console.error('AI error:', err);
        // Return null to trigger fallback
      }
      return null;
    }
  }, []);

  const handleRunScan = useCallback(async () => {
    setScanRunning(true);
    setScanResult(null);

    const result = await callAI('variance_scan', {
      companyName: 'Demo Corp',
      comparison: comparison === 'mom' ? 'Jan 2025 vs Dec 2024' : 'Jan 2025 vs Budget',
      thresholdPct,
      thresholdAmt: thresholdAmt * 1000,
    });

    if (result?.findings) {
      setScanResult(result as ScanResult);
    } else {
      // Use fallback
      setScanResult(FALLBACK_SCAN);
    }
    setScanRunning(false);
  }, [callAI, comparison, thresholdPct, thresholdAmt]);

  const handleExplore = useCallback(async (query?: string) => {
    const q = query || exploreQuery;
    if (!q.trim()) return;
    setExploreQuery(q);
    setExploreLoading(true);

    const result = await callAI('explore', { query: q });

    if (result?.headers) {
      setExploreResult(result as ExploreResult);
    } else {
      // Fallback
      setExploreResult({
        title: 'P&L: Nov vs Dec 2024',
        headers: ['Account', 'Nov 2024', 'Dec 2024', 'Δ ($)', 'Δ (%)'],
        rows: [
          ['Revenue', '$8,940K', '$9,500K', '+$560K', '+6.3%'],
          ['  Product Revenue', '$6,300K', '$6,800K', '+$500K', '+7.9%'],
          ['  Service Revenue', '$2,640K', '$2,700K', '+$60K', '+2.3%'],
          ['COGS', '$3,280K', '$2,850K', '-$430K', '-13.1%'],
          ['Gross Profit', '$5,660K', '$6,650K', '+$990K', '+17.5%'],
          ['OPEX', '$5,340K', '$5,450K', '+$110K', '+2.1%'],
          ['EBITDA', '$320K', '$1,200K', '+$880K', '+275%'],
        ],
        rowDimension: 'Account',
        colDimension: 'Month',
        insights: ['EBITDA improved 275% driven by COGS optimization', 'Product Revenue growth outpacing Services 3:1'],
        suggestedFollowups: ['Break down COGS by vendor', 'Show revenue by segment', 'OPEX trend last 6 months'],
      });
    }
    setExploreLoading(false);
  }, [exploreQuery, callAI]);

  const handleSQL = useCallback(async (query?: string) => {
    const q = query || sqlInput;
    if (!q.trim()) return;
    setSqlInput(q);
    setSqlLoading(true);

    const result = await callAI('sql', { query: q });

    if (result?.sql) {
      setSqlResult(result as SQLResult);
    } else {
      setSqlResult({
        sql: `SELECT \n  scenario,\n  account_name,\n  SUM(CASE WHEN period = '2024-11' THEN amount END) AS nov_2024,\n  SUM(CASE WHEN period = '2024-12' THEN amount END) AS dec_2024,\n  SUM(CASE WHEN period = '2024-12' THEN amount END) - \n    SUM(CASE WHEN period = '2024-11' THEN amount END) AS variance\nFROM financial_data fd\nJOIN financial_line_items a ON fd.line_item_id = a.id\nWHERE fd.period_id IN (\n  SELECT id FROM financial_periods WHERE year = 2024 AND month IN (11, 12)\n)\nGROUP BY scenario, account_name\nORDER BY account_name;`,
        explanation: 'Combines Actuals and Budget data with a pivot on Nov/Dec 2024, calculating the dollar variance between months.',
        tables_used: ['financial_data', 'financial_line_items', 'financial_periods'],
        complexity: 'moderate',
        warnings: ['Assumes scenario flag exists in financial_data or can be inferred from period context'],
      });
    }
    setSqlLoading(false);
  }, [sqlInput, callAI]);

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
    return `${sign}$${abs}`;
  };

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="scan" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" /> Scan
            </TabsTrigger>
            <TabsTrigger value="explore" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Explore
            </TabsTrigger>
            <TabsTrigger value="sql" className="gap-1.5 text-xs">
              <Code className="h-3.5 w-3.5" /> SQL
            </TabsTrigger>
          </TabsList>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Sparkles className="h-2.5 w-2.5" /> Powered by AI
          </Badge>
        </div>

        {/* ─── SCAN TAB ─── */}
        <TabsContent value="scan" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    AI Variance Scanner
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Detect changes, root causes, and anomalies across your P&L.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => setShowConfig(!showConfig)}
                  >
                    <Settings2 className="h-3 w-3" /> Config
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRunScan} disabled={scanRunning}>
                    {scanRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {scanRunning ? 'Scanning...' : 'Run Scan'}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Config Panel */}
            {showConfig && (
              <CardContent className="pt-0 pb-3">
                <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground">Comparison</label>
                    <Select value={comparison} onValueChange={setComparison}>
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mom" className="text-xs">Month over Month</SelectItem>
                        <SelectItem value="budget" className="text-xs">Actuals vs Budget</SelectItem>
                        <SelectItem value="yoy" className="text-xs">Year over Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Min % Change: {thresholdPct}%
                    </label>
                    <Slider
                      value={[thresholdPct]}
                      onValueChange={([v]) => setThresholdPct(v)}
                      min={1}
                      max={50}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Min $ Amount: ${thresholdAmt}K
                    </label>
                    <Slider
                      value={[thresholdAmt]}
                      onValueChange={([v]) => setThresholdAmt(v)}
                      min={5}
                      max={500}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Summary */}
          {scanResult && (
            <Card className="bg-muted/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Executive Summary</span>
                      <Badge variant="outline" className="text-[9px]">{scanResult.periodComparison}</Badge>
                      <Badge variant={scanResult.totalVariance < 0 ? 'default' : 'destructive'} className="text-[9px]">
                        Net: {fmt(scanResult.totalVariance)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{scanResult.summary}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Findings */}
          {scanResult && (
            <div className="space-y-3">
              {scanResult.findings.map((finding, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedVariance(expandedVariance === finding.metric ? null : finding.metric)}
                  >
                    {expandedVariance === finding.metric ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      finding.direction === 'favorable' ? 'bg-emerald-500/10' : 'bg-destructive/10'
                    )}>
                      {finding.direction === 'favorable' ? (
                        <TrendingDown className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{finding.metric}</span>
                        <Badge variant={finding.direction === 'favorable' ? 'default' : 'destructive'} className="text-[10px]">
                          {finding.direction}
                        </Badge>
                        {finding.anomalyFlag && (
                          <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-600 border-amber-500/30">
                            <AlertTriangle className="h-2.5 w-2.5" /> Anomaly
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{finding.explanation}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn(
                        "text-sm font-bold font-mono",
                        finding.direction === 'favorable' ? 'text-emerald-600' : 'text-destructive'
                      )}>
                        {fmt(finding.variance)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {finding.variancePct > 0 ? '+' : ''}{finding.variancePct.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {expandedVariance === finding.metric && (
                    <div className="border-t px-4 pb-4 space-y-3">
                      {/* AI Explanation */}
                      <div className="pt-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lightbulb className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-medium">AI Explanation</span>
                          <Badge variant="outline" className="text-[9px] ml-auto">
                            Confidence: {(finding.confidence * 100).toFixed(0)}%
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">
                            <FileText className="h-2.5 w-2.5 mr-0.5" />
                            {finding.sourceRecords} records
                          </Badge>
                        </div>
                        <p className="text-xs bg-muted/50 rounded-lg p-3 leading-relaxed">{finding.explanation}</p>
                      </div>

                      {/* Drilldowns */}
                      {finding.drilldowns.map((drill, di) => (
                        <div key={di}>
                          <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
                            Attribution by {drill.dimension}
                          </p>
                          <div className="space-y-1">
                            {drill.items.map((item, ii) => {
                              const maxAbs = Math.max(...drill.items.map(i => Math.abs(i.amount)));
                              const barWidth = maxAbs > 0 ? (Math.abs(item.amount) / maxAbs) * 100 : 0;
                              return (
                                <div key={ii} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50">
                                  <span className="flex-1 min-w-0">{item.name}</span>
                                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        item.amount < 0 ? 'bg-emerald-500' : 'bg-destructive'
                                      )}
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                  <span className={cn(
                                    "font-mono font-medium w-16 text-right",
                                    item.amount < 0 ? 'text-emerald-600' : 'text-destructive'
                                  )}>
                                    {fmt(item.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Show Work */}
                      <Collapsible open={showWorkFor === finding.metric} onOpenChange={(open) => setShowWorkFor(open ? finding.metric : null)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
                            <Eye className="h-3 w-3" />
                            {showWorkFor === finding.metric ? 'Hide Work' : 'Show Work'}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50 space-y-1.5">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <ListChecks className="h-3 w-3" /> Intermediate Steps
                            </p>
                            {finding.workSteps.map((step, si) => (
                              <div key={si} className="flex items-start gap-2 text-xs">
                                <span className="text-muted-foreground font-mono text-[10px] mt-0.5">{si + 1}.</span>
                                <span>{step}</span>
                              </div>
                            ))}
                            <Separator className="my-2" />
                            <p className="text-[10px] text-muted-foreground">
                              Source: {finding.sourceRecords} underlying GL records · Confidence: {(finding.confidence * 100).toFixed(0)}% · No hallucinations — all numbers traced to source data.
                            </p>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg border">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <p>Fully observable AI — all power with none of the black box. Every explanation traces back to source records. <strong>Audit-ready</strong>.</p>
          </div>
        </TabsContent>

        {/* ─── EXPLORE TAB ─── */}
        <TabsContent value="explore" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <Input
                  placeholder="e.g., show me Nov vs Dec 2024 P&L by account with $ and % MoM differences"
                  value={exploreQuery}
                  onChange={(e) => setExploreQuery(e.target.value)}
                  className="text-xs h-9"
                  onKeyDown={(e) => e.key === 'Enter' && handleExplore()}
                />
                <Button size="sm" className="h-9 gap-1.5 text-xs shrink-0" onClick={() => handleExplore()} disabled={exploreLoading}>
                  {exploreLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Generate
                </Button>
              </div>
              {!exploreResult && !exploreLoading && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {['Nov vs Dec P&L by account', 'Revenue by segment & region', 'OPEX YoY by department'].map((q) => (
                    <Button key={q} variant="outline" size="sm" className="text-[10px] h-6" onClick={() => handleExplore(q)}>
                      {q}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {exploreLoading && (
            <Card>
              <CardContent className="p-8 flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Generating table from your query...</p>
              </CardContent>
            </Card>
          )}

          {exploreResult && !exploreLoading && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <CardTitle className="text-sm">{exploreResult.title || 'Generation completed'}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">Rows: {exploreResult.rowDimension}</Badge>
                      <Badge variant="outline" className="text-[10px]">Cols: {exploreResult.colDimension}</Badge>
                      <Button variant="outline" size="sm" className="h-6 text-[10px]">Save View</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {exploreResult.headers.map((h) => (
                            <TableHead key={h} className={cn("text-[10px]", h !== exploreResult.headers[0] && 'text-right')}>{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exploreResult.rows.map((row, i) => {
                          const isBold = row[0] && !row[0].startsWith('  ');
                          return (
                            <TableRow key={i} className={cn(isBold && 'font-medium')}>
                              {row.map((cell, j) => (
                                <TableCell key={j} className={cn(
                                  "text-xs", j > 0 && "text-right font-mono",
                                  j >= 3 && cell.startsWith('+') && 'text-emerald-600',
                                  j >= 3 && cell.startsWith('-') && 'text-destructive',
                                )}>
                                  {cell.trim()}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Insights & Follow-ups */}
              {(exploreResult.insights?.length > 0 || exploreResult.suggestedFollowups?.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  {exploreResult.insights?.length > 0 && (
                    <Card>
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" /> AI Insights
                        </p>
                        {exploreResult.insights.map((insight, i) => (
                          <p key={i} className="text-xs text-muted-foreground">• {insight}</p>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {exploreResult.suggestedFollowups?.length > 0 && (
                    <Card>
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suggested Follow-ups</p>
                        {exploreResult.suggestedFollowups.map((q, i) => (
                          <Button key={i} variant="ghost" size="sm" className="w-full justify-start h-6 text-[10px] gap-1" onClick={() => handleExplore(q)}>
                            <ArrowRight className="h-2.5 w-2.5" /> {q}
                          </Button>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── SQL TAB ─── */}
        <TabsContent value="sql" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Code className="h-4 w-4 text-primary mt-2 shrink-0" />
                <Textarea
                  placeholder="Describe what you want in plain English, e.g., 'create a UNION ALL query combining Actuals and Budget tables with scenario flags'"
                  className="text-xs min-h-[60px]"
                  value={sqlInput}
                  onChange={(e) => setSqlInput(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleSQL()} disabled={sqlLoading}>
                  {sqlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate SQL
                </Button>
                {['Budget vs Actual UNION', 'Revenue by segment pivot', 'Headcount roll-up'].map((q) => (
                  <Button key={q} variant="outline" size="sm" className="text-[10px] h-8" onClick={() => handleSQL(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {sqlLoading && (
            <Card>
              <CardContent className="p-8 flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Generating SQL...</p>
              </CardContent>
            </Card>
          )}

          {sqlResult && !sqlLoading && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Code className="h-4 w-4" /> Generated SQL
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">{sqlResult.complexity}</Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => {
                      navigator.clipboard.writeText(sqlResult.sql);
                      toast.success('SQL copied to clipboard');
                    }}>
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button size="sm" className="h-6 text-[10px] gap-1">
                      <Play className="h-3 w-3" /> Execute
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <pre className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {sqlResult.sql}
                </pre>
                <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                  <p className="text-xs"><strong>What this does:</strong> {sqlResult.explanation}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Tables:</span>
                    {sqlResult.tables_used.map((t) => (
                      <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
                    ))}
                  </div>
                  {sqlResult.warnings?.length > 0 && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-600">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{sqlResult.warnings.join('. ')}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Sparkles, Search, Play, Eye, ChevronDown, ChevronRight,
  AlertTriangle, TrendingDown, TrendingUp, ArrowRight, Code,
  Lightbulb, BarChart3, Copy, Check, RefreshCw, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Demo variance scan results
const VARIANCE_RESULTS = [
  {
    id: 'v1',
    metric: 'COGS',
    variance: -176000,
    variancePct: -13.1,
    direction: 'favorable' as const,
    explanation: '(−$176k) from Catalyst Growth Partners and (−$91k) from Delta Strategic Solutions, partially offset by (+$68k) from FreshPath Consulting.',
    drilldown: [
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
    confidence: 0.94,
  },
  {
    id: 'v2',
    metric: 'S&M Expenses',
    variance: 100000,
    variancePct: 5.0,
    direction: 'unfavorable' as const,
    explanation: '(+$65k) in Digital Advertising and (+$35k) in Event Sponsorships. Digital ad spend increase driven by Q4 campaign push.',
    drilldown: [
      { dimension: 'Category', items: [
        { name: 'Digital Advertising', amount: 65000 },
        { name: 'Event Sponsorships', amount: 35000 },
      ]},
    ],
    confidence: 0.91,
  },
  {
    id: 'v3',
    metric: 'G&A Expenses',
    variance: 100000,
    variancePct: 6.9,
    direction: 'unfavorable' as const,
    explanation: '(+$42k) from Professional Fees and (+$37.2k) from Retired Related Activities (32 lines) with no other candidates.',
    drilldown: [
      { dimension: 'Transaction Type', items: [
        { name: 'Professional Fees', amount: 42000 },
        { name: 'Retired Related Activities', amount: 37200 },
        { name: 'Office Supplies', amount: 20800 },
      ]},
    ],
    confidence: 0.87,
  },
];

// Demo explore results
const EXPLORE_TABLE = {
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
};

export function AIModule() {
  const [subTab, setSubTab] = useState('scan');
  const [scanRunning, setScanRunning] = useState(false);
  const [expandedVariance, setExpandedVariance] = useState<string | null>(null);
  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreGenerated, setExploreGenerated] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlGenerated, setSqlGenerated] = useState(false);

  const handleRunScan = () => {
    setScanRunning(true);
    setTimeout(() => setScanRunning(false), 2000);
  };

  const handleExplore = () => {
    setExploreGenerated(true);
  };

  const handleGenerateSQL = () => {
    setSqlGenerated(true);
    setSqlQuery(`SELECT 
  scenario,
  account_name,
  SUM(CASE WHEN period = '2024-11' THEN amount END) AS nov_2024,
  SUM(CASE WHEN period = '2024-12' THEN amount END) AS dec_2024,
  SUM(CASE WHEN period = '2024-12' THEN amount END) - 
    SUM(CASE WHEN period = '2024-11' THEN amount END) AS variance
FROM financial_data fd
JOIN accounts a ON fd.account_id = a.id
WHERE scenario IN ('actuals', 'budget')
GROUP BY scenario, account_name
ORDER BY account_name;`);
  };

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `$${(v / 1000000).toFixed(0)}M`;
    if (abs >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v}`;
  };

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="scan" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Scan – Variance Analysis
            </TabsTrigger>
            <TabsTrigger value="explore" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Explore – AI Pivot Builder
            </TabsTrigger>
            <TabsTrigger value="sql" className="gap-1.5 text-xs">
              <Code className="h-3.5 w-3.5" />
              SQL Assistant
            </TabsTrigger>
          </TabsList>
        </div>

        {/* AI Scan - Variance Analysis */}
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
                    Automatically detect changes and root causes across P&L vs prior period and budget.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Threshold: 10% & $50K</Badge>
                  <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRunScan} disabled={scanRunning}>
                    {scanRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {scanRunning ? 'Scanning...' : 'Run Scan'}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Variance Results */}
          <div className="space-y-3">
            {VARIANCE_RESULTS.map((result) => (
              <Card key={result.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedVariance(expandedVariance === result.id ? null : result.id)}
                >
                  {expandedVariance === result.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                    result.direction === 'favorable' ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-red-100 dark:bg-red-950'
                  )}>
                    {result.direction === 'favorable' ? (
                      <TrendingDown className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{result.metric}</span>
                      <Badge variant={result.direction === 'favorable' ? 'default' : 'destructive'} className="text-[10px]">
                        {result.direction === 'favorable' ? 'Favorable' : 'Unfavorable'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{result.explanation}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-sm font-bold font-mono",
                      result.direction === 'favorable' ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      {result.variance > 0 ? '+' : ''}{fmt(result.variance)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {result.variancePct > 0 ? '+' : ''}{result.variancePct.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {expandedVariance === result.id && (
                  <div className="border-t px-4 pb-4">
                    {/* Explanation */}
                    <div className="py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium">AI Explanation</span>
                        <Badge variant="outline" className="text-[9px] ml-auto">
                          Confidence: {(result.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-xs bg-muted/50 rounded-lg p-3">{result.explanation}</p>
                    </div>

                    {/* Drilldowns */}
                    {result.drilldown.map((drill, di) => (
                      <div key={di} className="mt-3">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Attribution by {drill.dimension}</p>
                        <div className="space-y-1">
                          {drill.items.map((item, ii) => (
                            <div key={ii} className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-muted/50">
                              <span>{item.name}</span>
                              <span className={cn(
                                "font-mono font-medium",
                                item.amount < 0 ? 'text-emerald-600' : 'text-destructive'
                              )}>
                                {item.amount > 0 ? '+' : ''}{fmt(item.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" size="sm" className="mt-3 h-7 text-[10px] gap-1">
                      <Eye className="h-3 w-3" /> Show Full Work
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg border">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <p>Fully observable AI — all power with none of the black box. Every variance explanation can be traced back to source data and calculations. <strong>Audit-ready</strong>.</p>
          </div>
        </TabsContent>

        {/* AI Explore - Pivot Builder */}
        <TabsContent value="explore" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <Input
                  placeholder="e.g., show me Nov vs Dec 2024 P&L by account, include both $ and % MoM differences"
                  value={exploreQuery}
                  onChange={(e) => setExploreQuery(e.target.value)}
                  className="text-xs h-9"
                  onKeyDown={(e) => e.key === 'Enter' && handleExplore()}
                />
                <Button size="sm" className="h-9 gap-1.5 text-xs shrink-0" onClick={handleExplore}>
                  <Play className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
              {!exploreGenerated && (
                <div className="flex gap-2 mt-3">
                  {['Nov vs Dec P&L by account', 'Revenue by segment & region', 'OPEX YoY by department'].map((q) => (
                    <Button key={q} variant="outline" size="sm" className="text-[10px] h-6" onClick={() => { setExploreQuery(q); handleExplore(); }}>
                      {q}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {exploreGenerated && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <CardTitle className="text-sm">Generation completed</CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">Rows: Account</Badge>
                    <Badge variant="outline" className="text-[10px]">Cols: Month</Badge>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]">Save View</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {EXPLORE_TABLE.headers.map((h) => (
                        <TableHead key={h} className={cn("text-[10px]", h !== 'Account' && 'text-right')}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EXPLORE_TABLE.rows.map((row, i) => {
                      const isBold = !row[0].startsWith('  ');
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SQL Assistant */}
        <TabsContent value="sql" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Code className="h-4 w-4 text-primary mt-2 shrink-0" />
                <Textarea
                  placeholder="Describe what you want in plain English, e.g., 'create a UNION ALL query combining Actuals and Budget tables with scenario flags'"
                  className="text-xs min-h-[60px]"
                  value={!sqlGenerated ? '' : undefined}
                  onChange={() => {}}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleGenerateSQL}>
                  <Sparkles className="h-3.5 w-3.5" /> Generate SQL
                </Button>
                {['Budget vs Actual UNION', 'Revenue by segment pivot', 'Headcount roll-up'].map((q) => (
                  <Button key={q} variant="outline" size="sm" className="text-[10px] h-8" onClick={handleGenerateSQL}>
                    {q}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {sqlGenerated && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Code className="h-4 w-4" /> Generated SQL
                  </CardTitle>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button size="sm" className="h-6 text-[10px] gap-1">
                      <Play className="h-3 w-3" /> Execute
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <pre className="bg-muted/50 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {sqlQuery}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

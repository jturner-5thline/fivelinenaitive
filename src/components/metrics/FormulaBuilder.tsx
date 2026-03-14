import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Plus,
  Trash2,
  Calculator,
  Database,
  Hash,
  LayoutGrid,
  FunctionSquare,
  Search,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  FormulaNode,
  FormulaOperatorNode,
  FormulaFunctionDef,
  FORMULA_FUNCTIONS,
  ALL_FIELD_GROUPS,
  FIELD_AGGREGATIONS,
  formulaToString,
  evaluateFormula,
  FormulaContext,
} from '@/lib/customMetricEngine';
import { METRIC_WIDGET_DATA_SOURCES, ComparisonPeriod } from '@/contexts/MetricsWidgetsContext';
import { cn } from '@/lib/utils';

// ─── Source metric definitions for the Sources tab ─────────────

const HUBSPOT_SOURCE_METRICS = [
  { id: 'hs-total-deals', label: 'Deal Count' },
  { id: 'hs-deals-won', label: 'Won Deal Count' },
  { id: 'hs-total-deal-value', label: 'Total Won Value' },
  { id: 'hs-win-rate', label: 'Win Rate' },
  { id: 'hs-avg-deal-size', label: 'Avg Deal Size' },
  { id: 'hs-deals-lost', label: 'Deals Lost' },
  { id: 'hs-pipeline-by-stage', label: 'Deals by Stage' },
  { id: 'hs-deals-by-owner', label: 'Deals by Owner' },
];

const QUICKBOOKS_SOURCE_METRICS = [
  { id: 'qb-total-revenue', label: 'Total Revenue' },
  { id: 'qb-net-income', label: 'Net Income' },
  { id: 'qb-total-expenses', label: 'Total Expenses' },
  { id: 'qb-accounts-receivable', label: 'AR Balance' },
  { id: 'qb-total-ap', label: 'AP Balance' },
  { id: 'qb-ar-aging', label: 'AR Aging' },
  { id: 'qb-collection-rate', label: 'Collection Rate' },
  { id: 'qb-total-payments', label: 'Cash Balance' },
  { id: 'qb-overdue-amount', label: 'Overdue Amount' },
  { id: 'qb-active-customers', label: 'Active Customers' },
  { id: 'qb-active-vendors', label: 'Active Vendors' },
];

export type Timeframe = 'mtd' | 'qtd' | 'ytd' | 'last-30d' | 'last-90d' | 'last-12m' | 'all-time';

interface FormulaBuilderProps {
  value: FormulaNode | null;
  onChange: (node: FormulaNode) => void;
  availableWidgets?: { id: string; title: string }[];
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  entityFilter?: string;
  onEntityFilterChange?: (ef: string) => void;
  comparisonPeriod?: ComparisonPeriod;
  onComparisonPeriodChange?: (cp: ComparisonPeriod) => void;
  qbConnections?: { realmId: string; companyName?: string }[];
}

// ─── Token helpers ─────────────────────────────────────────────

interface FormulaToken {
  id: string;
  node: FormulaNode;
}

function generateId() {
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function nodeLabel(node: FormulaNode): string {
  switch (node.type) {
    case 'number': return String(node.value);
    case 'source': return node.label || node.sourceId;
    case 'widget': return node.label || `Widget: ${node.widgetId.slice(0, 8)}`;
    case 'field': return `${node.aggregation.toUpperCase()}(${node.label || `${node.entity}.${node.field}`})`;
    case 'function': return `${node.name}(...)`;
    case 'operator': return node.op;
    default: return '?';
  }
}

function getSourceType(node: FormulaNode): 'hubspot' | 'quickbooks' | 'naitive' | 'neutral' {
  if (node.type === 'source') {
    if (node.sourceId.startsWith('hs-')) return 'hubspot';
    if (node.sourceId.startsWith('qb-')) return 'quickbooks';
    return 'naitive';
  }
  if (node.type === 'field') {
    if (node.entity.startsWith('hubspot')) return 'hubspot';
    if (node.entity.startsWith('qb')) return 'quickbooks';
    return 'naitive';
  }
  return 'neutral';
}

function tokenColorClass(node: FormulaNode): string {
  const src = getSourceType(node);
  if (src === 'hubspot') return 'bg-[hsl(213,90%,70%,0.15)] text-[hsl(213,90%,55%)] border-[hsl(213,90%,70%,0.3)]';
  if (src === 'quickbooks') return 'bg-[hsl(142,71%,45%,0.15)] text-[hsl(142,71%,35%)] border-[hsl(142,71%,45%,0.3)]';
  if (src === 'naitive') return 'bg-[hsl(270,60%,60%,0.15)] text-[hsl(270,60%,50%)] border-[hsl(270,60%,60%,0.3)]';
  if (node.type === 'number' || node.type === 'operator') return 'bg-muted text-muted-foreground border-border';
  if (node.type === 'function') return 'bg-[hsl(270,60%,60%,0.15)] text-[hsl(270,60%,50%)] border-[hsl(270,60%,60%,0.3)]';
  return 'bg-muted text-muted-foreground border-border';
}

function flattenToTokens(node: FormulaNode | null): FormulaToken[] {
  if (!node) return [];
  if (node.type === 'operator') {
    const left = flattenToTokens(node.left);
    const right = flattenToTokens(node.right);
    return [
      ...left,
      { id: generateId(), node: { type: 'operator', op: node.op, left: { type: 'number', value: 0 }, right: { type: 'number', value: 0 } } as FormulaOperatorNode },
      ...right,
    ];
  }
  return [{ id: generateId(), node }];
}

function tokensToTree(tokens: FormulaToken[]): FormulaNode | null {
  const nonOpTokens = tokens.filter(t => t.node.type !== 'operator');
  const opTokens = tokens.filter(t => t.node.type === 'operator');
  if (nonOpTokens.length === 0) return null;
  if (nonOpTokens.length === 1) return nonOpTokens[0].node;
  let result: FormulaNode = nonOpTokens[0].node;
  for (let i = 1; i < nonOpTokens.length; i++) {
    const op = opTokens[i - 1]?.node as FormulaOperatorNode | undefined;
    result = { type: 'operator', op: op?.op || '+', left: result, right: nonOpTokens[i].node };
  }
  return result;
}

function formatPreviewValue(val: number): string {
  if (Math.abs(val) >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

// ─── Timeframe options ─────────────────────────────────────────

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: 'mtd', label: 'MTD' },
  { value: 'qtd', label: 'QTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'last-30d', label: '30d' },
  { value: 'last-90d', label: '90d' },
  { value: 'last-12m', label: '12m' },
  { value: 'all-time', label: 'All' },
];

// ─── Function category labels ──────────────────────────────────

const FUNCTION_CATEGORY_LABELS: Record<string, string> = {
  aggregation: 'Aggregations',
  conditional: 'Conditional',
  time: 'Time',
  math: 'Math',
};

const FUNCTION_CATEGORY_ORDER = ['aggregation', 'conditional', 'time', 'math'];

// ─── Data type badge colors ────────────────────────────────────

function dataTypeBadge(dt: string) {
  const map: Record<string, string> = {
    '$': 'bg-success/20 text-success',
    '%': 'bg-chart-4/20 text-chart-4',
    '#': 'bg-primary/20 text-primary',
    'date': 'bg-warning/20 text-warning',
    'text': 'bg-muted text-muted-foreground',
  };
  return map[dt] || 'bg-muted text-muted-foreground';
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function FormulaBuilder({
  value, onChange, availableWidgets = [],
  timeframe = 'all-time', onTimeframeChange,
  entityFilter = 'all', onEntityFilterChange,
  comparisonPeriod = 'none', onComparisonPeriodChange,
  qbConnections = [],
}: FormulaBuilderProps) {
  const [tokens, setTokens] = useState<FormulaToken[]>(() => flattenToTokens(value));
  const [activeTab, setActiveTab] = useState('sources');
  const [sourceSearch, setSourceSearch] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [funcSearch, setFuncSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ naitive: true, hubspot: true, quickbooks: true });

  const updateTokens = useCallback((newTokens: FormulaToken[]) => {
    setTokens(newTokens);
    const tree = tokensToTree(newTokens);
    if (tree) onChange(tree);
  }, [onChange]);

  const addToken = useCallback((node: FormulaNode) => {
    const newTokens = [...tokens];
    const nonOps = newTokens.filter(t => t.node.type !== 'operator');
    if (nonOps.length > 0 && node.type !== 'operator') {
      newTokens.push({ id: generateId(), node: { type: 'operator', op: '+', left: { type: 'number', value: 0 }, right: { type: 'number', value: 0 } } as FormulaOperatorNode });
    }
    newTokens.push({ id: generateId(), node });
    updateTokens(newTokens);
  }, [tokens, updateTokens]);

  const removeToken = useCallback((id: string) => {
    let newTokens = tokens.filter(t => t.id !== id);
    newTokens = newTokens.filter((t, i) => {
      if (t.node.type !== 'operator') return true;
      const prev = newTokens[i - 1];
      const next = newTokens[i + 1];
      return prev && next && prev.node.type !== 'operator' && next.node.type !== 'operator';
    });
    updateTokens(newTokens);
  }, [tokens, updateTokens]);

  const updateOperator = useCallback((id: string, op: '+' | '-' | '*' | '/') => {
    const newTokens = tokens.map(t => {
      if (t.id === id && t.node.type === 'operator') {
        return { ...t, node: { ...t.node, op } as FormulaOperatorNode };
      }
      return t;
    });
    updateTokens(newTokens);
  }, [tokens, updateTokens]);

  const [staticValue, setStaticValue] = useState('');
  const [selectedAgg, setSelectedAgg] = useState('sum');

  // Preview value
  const previewValue = useMemo(() => {
    if (!value) return null;
    const ctx: FormulaContext = { sources: {}, widgets: {} };
    // Provide sample values for preview
    METRIC_WIDGET_DATA_SOURCES.forEach(ds => { ctx.sources[ds.id] = Math.random() * 100_000_000; });
    try { return evaluateFormula(value, ctx); } catch { return null; }
  }, [value]);

  // Source lists
  const allSources = METRIC_WIDGET_DATA_SOURCES;
  const naitiveSources = allSources.filter(ds => !ds.id.startsWith('qb-') && !ds.id.startsWith('hs-') && !ds.id.startsWith('xs-'));
  
  const filterBySearch = (items: { id?: string; label: string }[], search: string) =>
    items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));

  // Grouped functions
  const groupedFunctions = useMemo(() => {
    const groups: Record<string, FormulaFunctionDef[]> = {};
    FORMULA_FUNCTIONS.forEach(fn => {
      if (!groups[fn.category]) groups[fn.category] = [];
      if (!funcSearch || fn.name.toLowerCase().includes(funcSearch.toLowerCase()) || fn.description.toLowerCase().includes(funcSearch.toLowerCase())) {
        groups[fn.category].push(fn);
      }
    });
    return groups;
  }, [funcSearch]);

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-3">
      {/* ─── Timeframe + Entity + Comparison Row ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Timeframe pills */}
        <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
          {TIMEFRAME_OPTIONS.map(tf => (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange?.(tf.value)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all',
                timeframe === tf.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Entity scope */}
        <Select value={entityFilter} onValueChange={v => onEntityFilterChange?.(v)}>
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {qbConnections.map(c => (
              <SelectItem key={c.realmId} value={c.realmId}>{c.companyName || c.realmId}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Comparison period */}
        <Select value={comparisonPeriod} onValueChange={v => onComparisonPeriodChange?.(v as ComparisonPeriod)}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="No Comparison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Comparison</SelectItem>
            <SelectItem value="prev-month">vs Prior Month</SelectItem>
            <SelectItem value="prev-quarter">vs Prior Quarter</SelectItem>
            <SelectItem value="prev-year">vs Prior Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Formula Token Bar ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-medium">Formula</Label>
        </div>
        <Card className="border-dashed border-primary/30 bg-muted/20">
          <CardContent className="p-2.5 min-h-[44px]">
            {tokens.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Click metrics, fields or functions below to build your formula…</p>
            ) : (
              <div className="flex flex-wrap gap-1 items-center">
                {tokens.map((token) => (
                  <div key={token.id} className="flex items-center">
                    {token.node.type === 'operator' ? (
                      <Select
                        value={(token.node as FormulaOperatorNode).op}
                        onValueChange={(v) => updateOperator(token.id, v as '+' | '-' | '*' | '/')}
                      >
                        <SelectTrigger className="h-6 w-10 text-[10px] px-1 font-mono border-dashed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="+">+</SelectItem>
                          <SelectItem value="-">−</SelectItem>
                          <SelectItem value="*">×</SelectItem>
                          <SelectItem value="/">÷</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] px-2 py-0.5 border gap-1 font-medium',
                                tokenColorClass(token.node)
                              )}
                            >
                              {nodeLabel(token.node)}
                              <button
                                className="ml-0.5 hover:text-destructive transition-colors"
                                onClick={() => removeToken(token.id)}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs font-mono">{formulaToString(token.node)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {/* Preview value */}
        {tokens.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground font-mono">
              = {value ? formulaToString(value) : '…'}
            </p>
            {previewValue !== null && (
              <span className="text-[10px] font-semibold text-primary">
                Preview: {formatPreviewValue(previewValue)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick Operators */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground mr-1">Operators:</span>
        {(['+', '-', '*', '/'] as const).map((op) => (
          <Button
            key={op}
            variant="outline"
            size="sm"
            className="h-6 w-6 p-0 text-xs font-mono"
            onClick={() => {
              const lastToken = tokens[tokens.length - 1];
              if (lastToken && lastToken.node.type !== 'operator') {
                const newTokens = [...tokens, { id: generateId(), node: { type: 'operator', op, left: { type: 'number', value: 0 }, right: { type: 'number', value: 0 } } as FormulaOperatorNode }];
                updateTokens(newTokens);
              }
            }}
          >
            {op === '*' ? '×' : op === '/' ? '÷' : op}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-xs" onClick={() => {
          const lastToken = tokens[tokens.length - 1];
          if (lastToken && lastToken.node.type !== 'operator') {
            const newTokens = [...tokens, { id: generateId(), node: { type: 'operator', op: '*' as const, left: { type: 'number', value: 0 }, right: { type: 'number', value: 0 } } as FormulaOperatorNode }];
            newTokens.push({ id: generateId(), node: { type: 'number', value: 0.01 } });
            updateTokens(newTokens);
          }
        }}>%</Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => updateTokens([])}>
          <Trash2 className="h-3 w-3 mr-1" /> Clear
        </Button>
      </div>

      {/* ─── Token Palette Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 h-7">
          <TabsTrigger value="sources" className="text-[10px] gap-1"><Database className="h-3 w-3" />Sources</TabsTrigger>
          <TabsTrigger value="fields" className="text-[10px] gap-1"><LayoutGrid className="h-3 w-3" />Fields</TabsTrigger>
          <TabsTrigger value="widgets" className="text-[10px] gap-1"><LayoutGrid className="h-3 w-3" />Widgets</TabsTrigger>
          <TabsTrigger value="values" className="text-[10px] gap-1"><Hash className="h-3 w-3" />Values</TabsTrigger>
          <TabsTrigger value="functions" className="text-[10px] gap-1"><FunctionSquare className="h-3 w-3" />Fn</TabsTrigger>
        </TabsList>

        {/* ─── SOURCES ─── */}
        <TabsContent value="sources" className="mt-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="h-7 pl-7 text-xs" placeholder="Search metrics…" value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} />
          </div>
          <ScrollArea className="h-[200px]">
            <div className="space-y-1">
              {/* naitive */}
              <Collapsible open={openSections.naitive} onOpenChange={() => toggleSection('naitive')}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  {openSections.naitive ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="inline-block w-2 h-2 rounded-full bg-[hsl(270,60%,60%)]" />
                  naitive
                  <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">{naitiveSources.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 gap-0.5 pl-4">
                    {filterBySearch(naitiveSources, sourceSearch).map(ds => (
                      <Button key={ds.id} variant="ghost" size="sm" className="justify-start text-[10px] h-6 px-1.5 font-normal"
                        onClick={() => addToken({ type: 'source', sourceId: ds.id, label: ds.label })}>
                        <Plus className="h-2.5 w-2.5 mr-1 shrink-0 text-[hsl(270,60%,60%)]" />
                        <span className="truncate">{ds.label}</span>
                      </Button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* HubSpot */}
              <Collapsible open={openSections.hubspot} onOpenChange={() => toggleSection('hubspot')}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  {openSections.hubspot ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="inline-block w-2 h-2 rounded-full bg-[hsl(213,90%,55%)]" />
                  HubSpot
                  <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">{HUBSPOT_SOURCE_METRICS.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 gap-0.5 pl-4">
                    {filterBySearch(HUBSPOT_SOURCE_METRICS, sourceSearch).map(m => (
                      <Button key={m.id} variant="ghost" size="sm" className="justify-start text-[10px] h-6 px-1.5 font-normal"
                        onClick={() => addToken({ type: 'source', sourceId: m.id, label: m.label })}>
                        <Plus className="h-2.5 w-2.5 mr-1 shrink-0 text-[hsl(213,90%,55%)]" />
                        <span className="truncate">{m.label}</span>
                      </Button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* QuickBooks */}
              <Collapsible open={openSections.quickbooks} onOpenChange={() => toggleSection('quickbooks')}>
                <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  {openSections.quickbooks ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="inline-block w-2 h-2 rounded-full bg-[hsl(142,71%,45%)]" />
                  QuickBooks
                  <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">{QUICKBOOKS_SOURCE_METRICS.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-2 gap-0.5 pl-4">
                    {filterBySearch(QUICKBOOKS_SOURCE_METRICS, sourceSearch).map(m => (
                      <Button key={m.id} variant="ghost" size="sm" className="justify-start text-[10px] h-6 px-1.5 font-normal"
                        onClick={() => addToken({ type: 'source', sourceId: m.id, label: m.label })}>
                        <Plus className="h-2.5 w-2.5 mr-1 shrink-0 text-[hsl(142,71%,45%)]" />
                        <span className="truncate">{m.label}</span>
                      </Button>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── FIELDS (grouped searchable picker) ─── */}
        <TabsContent value="fields" className="mt-2">
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input className="h-7 pl-7 text-xs" placeholder="Search fields…" value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} />
              </div>
              <Select value={selectedAgg} onValueChange={setSelectedAgg}>
                <SelectTrigger className="h-7 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_AGGREGATIONS.map(a => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-[180px]">
              <div className="space-y-2">
                {ALL_FIELD_GROUPS.map(group => {
                  const filtered = group.fields.filter(f =>
                    !fieldSearch || f.label.toLowerCase().includes(fieldSearch.toLowerCase()) || f.field.toLowerCase().includes(fieldSearch.toLowerCase())
                  );
                  if (filtered.length === 0) return null;
                  const sourceColor = group.source === 'hubspot' ? 'bg-[hsl(213,90%,55%)]' : group.source === 'quickbooks' ? 'bg-[hsl(142,71%,45%)]' : 'bg-[hsl(270,60%,60%)]';
                  return (
                    <div key={group.groupLabel}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn('w-1.5 h-1.5 rounded-full', sourceColor)} />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.groupLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-0.5 pl-3">
                        {filtered.map(f => (
                          <Button
                            key={`${f.entity}-${f.field}`}
                            variant="ghost"
                            size="sm"
                            className="justify-start text-[10px] h-6 px-1.5 font-normal gap-1"
                            onClick={() => addToken({
                              type: 'field',
                              entity: f.entity,
                              field: f.field,
                              aggregation: selectedAgg as 'sum' | 'avg' | 'count' | 'min' | 'max',
                              label: `${selectedAgg.toUpperCase()}(${f.label})`,
                            })}
                          >
                            <Badge variant="outline" className={cn('text-[8px] h-3.5 px-1 font-mono', dataTypeBadge(f.dataType))}>{f.dataType}</Badge>
                            <span className="truncate">{f.label}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ─── WIDGETS ─── */}
        <TabsContent value="widgets" className="mt-2">
          <ScrollArea className="h-[180px]">
            {availableWidgets.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No other widgets available to reference.</p>
            ) : (
              <div className="grid grid-cols-2 gap-0.5">
                {availableWidgets.map(w => (
                  <Button key={w.id} variant="ghost" size="sm" className="justify-start text-[10px] h-6 px-1.5 font-normal truncate"
                    onClick={() => addToken({ type: 'widget', widgetId: w.id, label: w.title })}>
                    <Plus className="h-2.5 w-2.5 mr-1 shrink-0" />
                    <span className="truncate">{w.title}</span>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ─── VALUES ─── */}
        <TabsContent value="values" className="mt-2">
          <div className="flex gap-2">
            <Input type="number" className="h-7 text-xs flex-1" placeholder="Enter a number…" value={staticValue} onChange={e => setStaticValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && staticValue) { addToken({ type: 'number', value: parseFloat(staticValue) || 0 }); setStaticValue(''); } }} />
            <Button size="sm" className="h-7 text-xs" disabled={!staticValue}
              onClick={() => { addToken({ type: 'number', value: parseFloat(staticValue) || 0 }); setStaticValue(''); }}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          <div className="flex gap-1 mt-2">
            {[100, 1000, 10000, 100000, 1000000].map(v => (
              <Button key={v} variant="outline" size="sm" className="text-[10px] h-5 px-1.5"
                onClick={() => addToken({ type: 'number', value: v })}>
                {v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}k` : v}
              </Button>
            ))}
          </div>
        </TabsContent>

        {/* ─── FUNCTIONS (expanded + grouped) ─── */}
        <TabsContent value="functions" className="mt-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input className="h-7 pl-7 text-xs" placeholder="Search functions…" value={funcSearch} onChange={e => setFuncSearch(e.target.value)} />
          </div>
          <ScrollArea className="h-[180px]">
            <div className="space-y-2">
              {FUNCTION_CATEGORY_ORDER.map(cat => {
                const fns = groupedFunctions[cat];
                if (!fns || fns.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 px-1">{FUNCTION_CATEGORY_LABELS[cat]}</p>
                    <div className="space-y-0.5">
                      {fns.map(fn => (
                        <Button key={fn.name} variant="ghost" size="sm" className="w-full justify-start text-[10px] h-7 px-1.5 font-normal"
                          onClick={() => addToken({ type: 'function', name: fn.name, args: [{ type: 'number', value: 0 }] })}>
                          <FunctionSquare className="h-3 w-3 mr-1.5 shrink-0 text-[hsl(270,60%,60%)]" />
                          <span className="font-mono font-medium mr-1.5">{fn.name}</span>
                          <span className="text-muted-foreground font-mono text-[9px]">({fn.args})</span>
                          <span className="ml-auto text-muted-foreground text-[9px] truncate max-w-[120px]">{fn.description}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

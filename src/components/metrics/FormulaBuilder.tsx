import { useState, useCallback } from 'react';
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
  Plus,
  Trash2,
  Calculator,
  Database,
  Hash,
  LayoutGrid,
  FunctionSquare,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import {
  FormulaNode,
  FormulaOperatorNode,
  FORMULA_FUNCTIONS,
  DEAL_FIELDS,
  FIELD_AGGREGATIONS,
  formulaToString,
} from '@/lib/customMetricEngine';
import { METRIC_WIDGET_DATA_SOURCES } from '@/contexts/MetricsWidgetsContext';
import { cn } from '@/lib/utils';

interface FormulaBuilderProps {
  value: FormulaNode | null;
  onChange: (node: FormulaNode) => void;
  availableWidgets?: { id: string; title: string }[];
}

// Token representation for the visual builder
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

function tokenColor(node: FormulaNode): string {
  switch (node.type) {
    case 'number': return 'bg-chart-4/20 text-chart-4 border-chart-4/30';
    case 'source': return 'bg-primary/20 text-primary border-primary/30';
    case 'widget': return 'bg-chart-2/20 text-chart-2 border-chart-2/30';
    case 'field': return 'bg-chart-3/20 text-chart-3 border-chart-3/30';
    case 'operator': return 'bg-muted text-muted-foreground border-border';
    case 'function': return 'bg-chart-5/20 text-chart-5 border-chart-5/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Build a flat list of tokens + operators from a formula tree for display.
 */
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

/**
 * Rebuild tree from flat token list (left-to-right, no precedence for simplicity).
 */
function tokensToTree(tokens: FormulaToken[]): FormulaNode | null {
  const nonOpTokens = tokens.filter(t => t.node.type !== 'operator');
  const opTokens = tokens.filter(t => t.node.type === 'operator');

  if (nonOpTokens.length === 0) return null;
  if (nonOpTokens.length === 1) return nonOpTokens[0].node;

  // Build left-to-right chain
  let result: FormulaNode = nonOpTokens[0].node;
  for (let i = 1; i < nonOpTokens.length; i++) {
    const op = opTokens[i - 1]?.node as FormulaOperatorNode | undefined;
    result = {
      type: 'operator',
      op: op?.op || '+',
      left: result,
      right: nonOpTokens[i].node,
    };
  }
  return result;
}

export function FormulaBuilder({ value, onChange, availableWidgets = [] }: FormulaBuilderProps) {
  const [tokens, setTokens] = useState<FormulaToken[]>(() => flattenToTokens(value));
  const [activeTab, setActiveTab] = useState('sources');

  // Sync tokens → tree on changes
  const updateTokens = useCallback((newTokens: FormulaToken[]) => {
    setTokens(newTokens);
    const tree = tokensToTree(newTokens);
    if (tree) onChange(tree);
  }, [onChange]);

  const addToken = useCallback((node: FormulaNode) => {
    const newTokens = [...tokens];
    // If we already have operand tokens, insert an operator before adding new operand
    const nonOps = newTokens.filter(t => t.node.type !== 'operator');
    if (nonOps.length > 0 && node.type !== 'operator') {
      newTokens.push({ id: generateId(), node: { type: 'operator', op: '+', left: { type: 'number', value: 0 }, right: { type: 'number', value: 0 } } as FormulaOperatorNode });
    }
    newTokens.push({ id: generateId(), node });
    updateTokens(newTokens);
  }, [tokens, updateTokens]);

  const removeToken = useCallback((id: string) => {
    let newTokens = tokens.filter(t => t.id !== id);
    // Clean up orphaned operators
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
  const [selectedField, setSelectedField] = useState('');
  const [selectedAgg, setSelectedAgg] = useState('sum');
  const [selectedFunction, setSelectedFunction] = useState('');

  const allSources = METRIC_WIDGET_DATA_SOURCES;
  const naitiveSources = allSources.filter(ds => !ds.id.startsWith('qb-') && !ds.id.startsWith('hs-'));
  const qbSources = allSources.filter(ds => ds.id.startsWith('qb-'));
  const hsSources = allSources.filter(ds => ds.id.startsWith('hs-'));

  return (
    <div className="space-y-4">
      {/* Formula Display Bar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Formula</Label>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-3">
            {tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Click items below to build your formula...
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 items-center">
                {tokens.map((token) => (
                  <div key={token.id} className="flex items-center gap-0.5">
                    {token.node.type === 'operator' ? (
                      <Select
                        value={(token.node as FormulaOperatorNode).op}
                        onValueChange={(v) => updateOperator(token.id, v as '+' | '-' | '*' | '/')}
                      >
                        <SelectTrigger className="h-7 w-12 text-xs px-1">
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
                                'cursor-pointer text-xs px-2 py-1 border',
                                tokenColor(token.node)
                              )}
                            >
                              {nodeLabel(token.node)}
                              <button
                                className="ml-1 hover:text-destructive"
                                onClick={() => removeToken(token.id)}
                              >
                                ×
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{formulaToString(token.node)}</p>
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
        {tokens.length > 0 && (
          <p className="text-xs text-muted-foreground font-mono">
            = {value ? formulaToString(value) : '...'}
          </p>
        )}
      </div>

      {/* Token Palette */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 h-8">
          <TabsTrigger value="sources" className="text-xs gap-1"><Database className="h-3 w-3" />Sources</TabsTrigger>
          <TabsTrigger value="fields" className="text-xs gap-1"><LayoutGrid className="h-3 w-3" />Fields</TabsTrigger>
          <TabsTrigger value="widgets" className="text-xs gap-1"><LayoutGrid className="h-3 w-3" />Widgets</TabsTrigger>
          <TabsTrigger value="values" className="text-xs gap-1"><Hash className="h-3 w-3" />Values</TabsTrigger>
          <TabsTrigger value="functions" className="text-xs gap-1"><FunctionSquare className="h-3 w-3" />Functions</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="mt-2">
          <ScrollArea className="h-48">
            <div className="space-y-3">
              {/* naitive Sources */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">naitive</p>
                <div className="grid grid-cols-2 gap-1">
                  {naitiveSources.map((ds) => (
                    <Button
                      key={ds.id}
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-7 truncate"
                      onClick={() => addToken({ type: 'source', sourceId: ds.id, label: ds.label })}
                    >
                      <Plus className="h-3 w-3 mr-1 shrink-0" />
                      <span className="truncate">{ds.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              {/* QuickBooks Sources */}
              {qbSources.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">QuickBooks</p>
                  <div className="grid grid-cols-2 gap-1">
                    {qbSources.map((ds) => (
                      <Button
                        key={ds.id}
                        variant="outline"
                        size="sm"
                        className="justify-start text-xs h-7 truncate"
                        onClick={() => addToken({ type: 'source', sourceId: ds.id, label: ds.label })}
                      >
                        <Plus className="h-3 w-3 mr-1 shrink-0" />
                        <span className="truncate">{ds.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {/* HubSpot Sources */}
              {hsSources.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">HubSpot</p>
                  <div className="grid grid-cols-2 gap-1">
                    {hsSources.map((ds) => (
                      <Button
                        key={ds.id}
                        variant="outline"
                        size="sm"
                        className="justify-start text-xs h-7 truncate"
                        onClick={() => addToken({ type: 'source', sourceId: ds.id, label: ds.label })}
                      >
                        <Plus className="h-3 w-3 mr-1 shrink-0" />
                        <span className="truncate">{ds.label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="fields" className="mt-2">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_FIELDS.map((f) => (
                    <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAgg} onValueChange={setSelectedAgg}>
                <SelectTrigger className="h-8 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_AGGREGATIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!selectedField}
                onClick={() => {
                  const fieldDef = DEAL_FIELDS.find(f => f.field === selectedField);
                  if (fieldDef) {
                    addToken({
                      type: 'field',
                      entity: fieldDef.entity,
                      field: fieldDef.field,
                      aggregation: selectedAgg as 'sum' | 'avg' | 'count' | 'min' | 'max',
                      label: `${selectedAgg.toUpperCase()}(${fieldDef.label})`,
                    });
                  }
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="widgets" className="mt-2">
          <ScrollArea className="h-36">
            {availableWidgets.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No other widgets available to reference.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {availableWidgets.map((w) => (
                  <Button
                    key={w.id}
                    variant="outline"
                    size="sm"
                    className="justify-start text-xs h-7 truncate"
                    onClick={() => addToken({ type: 'widget', widgetId: w.id, label: w.title })}
                  >
                    <Plus className="h-3 w-3 mr-1 shrink-0" />
                    <span className="truncate">{w.title}</span>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="values" className="mt-2">
          <div className="flex gap-2">
            <Input
              type="number"
              className="h-8 text-xs"
              placeholder="Enter a number..."
              value={staticValue}
              onChange={(e) => setStaticValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && staticValue) {
                  addToken({ type: 'number', value: parseFloat(staticValue) || 0 });
                  setStaticValue('');
                }
              }}
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!staticValue}
              onClick={() => {
                addToken({ type: 'number', value: parseFloat(staticValue) || 0 });
                setStaticValue('');
              }}
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          <div className="flex gap-1 mt-2">
            {[100, 1000, 10000, 100000, 1000000].map((v) => (
              <Button
                key={v}
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => addToken({ type: 'number', value: v })}
              >
                {v >= 1000000 ? `${v / 1000000}M` : v >= 1000 ? `${v / 1000}k` : v}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="functions" className="mt-2">
          <ScrollArea className="h-36">
            <div className="space-y-1">
              {FORMULA_FUNCTIONS.map((fn) => (
                <Button
                  key={fn.name}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                  onClick={() => {
                    addToken({
                      type: 'function',
                      name: fn.name,
                      args: [{ type: 'number', value: 0 }],
                    });
                  }}
                >
                  <FunctionSquare className="h-3 w-3 mr-2 shrink-0 text-chart-5" />
                  <span className="font-mono mr-2">{fn.name}({fn.args})</span>
                  <span className="text-muted-foreground truncate">— {fn.description}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Quick Operators */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Operators:</span>
        {(['+', '-', '*', '/'] as const).map((op) => (
          <Button
            key={op}
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 text-xs font-mono"
            onClick={() => {
              // Only add operator if last token is not an operator
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
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive"
          onClick={() => updateTokens([])}
        >
          <Trash2 className="h-3 w-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}

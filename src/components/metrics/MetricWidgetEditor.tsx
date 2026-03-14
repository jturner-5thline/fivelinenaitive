import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calculator, Database, LayoutTemplate, DollarSign, Percent, BarChart3,
  TrendingUp, Building2, User, ArrowUpRight,
} from 'lucide-react';
import {
  MetricWidgetConfig,
  MetricWidgetType,
  MetricChartType,
  MetricWidgetSize,
  ComparisonPeriod,
  TimePeriod,
  TIME_PERIOD_OPTIONS,
  METRIC_WIDGET_DATA_SOURCES,
} from '@/contexts/MetricsWidgetsContext';
import { FormulaBuilder, Timeframe } from './FormulaBuilder';
import { MetricTemplateGallery } from './MetricTemplateGallery';
import { FormulaNode, FormulaResultType } from '@/lib/customMetricEngine';
import { useCustomMetrics } from '@/hooks/useCustomMetrics';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';
import { cn } from '@/lib/utils';

interface MetricWidgetEditorProps {
  widget?: MetricWidgetConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => void;
  availableWidgets?: { id: string; title: string }[];
  existingDataSources?: string[];
}

const SIZE_OPTIONS: { value: MetricWidgetSize; label: string }[] = [
  { value: 'small', label: 'Small (1/4)' },
  { value: 'medium', label: 'Medium (1/2)' },
  { value: 'large', label: 'Large (2/3)' },
  { value: 'full', label: 'Full width' },
];

const CHART_TYPE_OPTIONS: { value: MetricChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'area', label: 'Area' },
  { value: 'composed', label: 'Composed' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'radar', label: 'Radar' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'forecast', label: 'Forecast' },
];

// ─── 8 brand-consistent colors ─────────────────────────────────

const COLOR_OPTIONS = [
  { value: 'hsl(var(--primary))', label: 'Primary', className: 'bg-primary' },
  { value: 'hsl(var(--success))', label: 'Success', className: 'bg-success' },
  { value: 'hsl(var(--chart-2))', label: 'Teal', className: 'bg-chart-2' },
  { value: 'hsl(var(--chart-3))', label: 'Amber', className: 'bg-chart-3' },
  { value: 'hsl(var(--chart-4))', label: 'Blue', className: 'bg-chart-4' },
  { value: 'hsl(var(--destructive))', label: 'Red', className: 'bg-destructive' },
  { value: 'hsl(var(--accent))', label: 'Accent', className: 'bg-accent' },
  { value: 'hsl(var(--chart-5))', label: 'Slate', className: 'bg-chart-5' },
];

// ─── Icon picker for stat cards ────────────────────────────────

type StatIcon = 'dollar' | 'percent' | 'chart' | 'arrow' | 'building' | 'user';

const STAT_ICONS: { value: StatIcon; label: string; icon: React.ElementType }[] = [
  { value: 'dollar', label: 'Dollar', icon: DollarSign },
  { value: 'percent', label: 'Percent', icon: Percent },
  { value: 'chart', label: 'Chart', icon: BarChart3 },
  { value: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { value: 'building', label: 'Building', icon: Building2 },
  { value: 'user', label: 'User', icon: User },
];

type DataMode = 'template' | 'preset' | 'custom';

export function MetricWidgetEditor({ widget, isOpen, onClose, onSave, availableWidgets = [], existingDataSources = [] }: MetricWidgetEditorProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MetricWidgetType>('chart');
  const [chartType, setChartType] = useState<MetricChartType>('bar');
  const [dataSource, setDataSource] = useState('');
  const [size, setSize] = useState<MetricWidgetSize>('medium');
  const [color, setColor] = useState('hsl(var(--primary))');
  const [customHex, setCustomHex] = useState('');
  const [statIcon, setStatIcon] = useState<StatIcon>('dollar');
  const [dataMode, setDataMode] = useState<DataMode>(widget ? 'preset' : 'template');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>('none');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all-time');
  const [timeframe, setTimeframe] = useState<Timeframe>('all-time');

  // Custom metric fields
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [formula, setFormula] = useState<FormulaNode | null>(null);
  const [resultType, setResultType] = useState<FormulaResultType>('number');
  const [selectedCustomMetricId, setSelectedCustomMetricId] = useState('');

  const { metrics: customMetrics, createMetric, updateMetric } = useCustomMetrics();
  const { data: qbStatus } = useQuickBooksStatus();

  const qbConnections = useMemo(() => qbStatus?.connections || [], [qbStatus]);

  useEffect(() => {
    if (widget) {
      setTitle(widget.title);
      setType(widget.type);
      setChartType(widget.chartType || 'bar');
      setDataSource(widget.dataSource);
      setSize(widget.size);
      setColor(widget.color);
      setEntityFilter(widget.entityFilter || 'all');
      setComparisonPeriod(widget.comparisonPeriod || 'none');
      setTimePeriod(widget.timePeriod || 'all-time');
      if (widget.dataSource.startsWith('custom-')) {
        setDataMode('custom');
        const metricId = widget.dataSource.replace('custom-', '');
        setSelectedCustomMetricId(metricId);
        const existing = customMetrics.find(m => m.id === metricId);
        if (existing) {
          setCustomName(existing.name);
          setCustomDescription(existing.description || '');
          setFormula(existing.formula);
          setResultType(existing.result_type);
        }
      } else {
        setDataMode('preset');
        setSelectedCustomMetricId('');
      }
    } else {
      setTitle(''); setType('chart'); setChartType('bar'); setDataSource(''); setSize('medium');
      setColor('hsl(var(--primary))'); setDataMode('template'); setCustomName(''); setCustomDescription('');
      setFormula(null); setResultType('number'); setSelectedCustomMetricId('');
      setEntityFilter('all'); setComparisonPeriod('none'); setTimePeriod('all-time'); setTimeframe('all-time');
      setStatIcon('dollar'); setCustomHex('');
    }
  }, [widget, isOpen, customMetrics]);

  const filteredDataSources = METRIC_WIDGET_DATA_SOURCES.filter(ds => ds.type === type);

  const handleTemplateSelect = (widgetData: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => {
    onSave(widgetData);
    onClose();
  };

  const handleSave = async () => {
    console.log('[MetricWidgetEditor] handleSave called', { title, dataMode, dataSource, customName, formula: !!formula });
    if (!title.trim()) { console.log('[MetricWidgetEditor] title empty, returning'); return; }
    if (dataMode === 'custom') {
      if (!formula || !customName.trim()) { console.log('[MetricWidgetEditor] custom mode missing fields'); return; }
      try {
        let metricId = selectedCustomMetricId;
        if (metricId && customMetrics.find(m => m.id === metricId)) {
          await updateMetric.mutateAsync({ id: metricId, name: customName.trim(), description: customDescription.trim() || undefined, formula, result_type: resultType });
        } else {
          const result = await createMetric.mutateAsync({ name: customName.trim(), description: customDescription.trim() || undefined, formula, result_type: resultType });
          metricId = result.id;
        }
        onSave({ title: title.trim(), type: 'stat', dataSource: `custom-${metricId}`, size, color, entityFilter: entityFilter !== 'all' ? entityFilter : undefined, comparisonPeriod: comparisonPeriod !== 'none' ? comparisonPeriod : undefined, timePeriod: timePeriod !== 'all-time' ? timePeriod : undefined });
      } catch { return; }
    } else {
      if (!dataSource) { console.log('[MetricWidgetEditor] no dataSource, returning'); return; }
      onSave({ title: title.trim(), type, chartType: type === 'chart' ? chartType : undefined, dataSource, size, color, entityFilter: entityFilter !== 'all' ? entityFilter : undefined, comparisonPeriod: comparisonPeriod !== 'none' ? comparisonPeriod : undefined, timePeriod: timePeriod !== 'all-time' ? timePeriod : undefined });
    }
    onClose();
  };

  const isValid = dataMode === 'preset' ? !!(title.trim() && dataSource) : dataMode === 'custom' ? !!(title.trim() && customName.trim() && formula) : false;
  console.log('[MetricWidgetEditor] isValid:', isValid, { dataMode, title: title.trim(), dataSource });

  // ─── Live mini preview ───────────────────────────────────────

  const PreviewCard = () => {
    const displayTitle = title || 'Widget Title';
    const IconComp = STAT_ICONS.find(i => i.value === statIcon)?.icon || DollarSign;
    return (
      <div className="space-y-1">
        <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Preview</p>
        <Card className="w-[180px] overflow-hidden" style={{ borderColor: color }}>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: color, opacity: 0.15 }}>
                <IconComp className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground truncate">{displayTitle}</span>
            </div>
            {type === 'stat' || dataMode === 'custom' ? (
              <div>
                <p className="text-lg font-bold" style={{ color }}>$284.8M</p>
                <p className="text-[9px] text-success flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />+12.3%</p>
              </div>
            ) : (
              <div className="flex items-end gap-0.5 h-8">
                {[40, 65, 50, 80, 60, 75, 90].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, backgroundColor: color, opacity: 0.6 + i * 0.05 }} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[780px] max-h-[88vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{widget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>

        <Tabs value={dataMode} onValueChange={(v) => setDataMode(v as DataMode)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-3">
            <TabsList className="w-full grid grid-cols-3">
              {!widget && (
                <TabsTrigger value="template" className="gap-1.5 text-xs">
                  <LayoutTemplate className="h-3.5 w-3.5" /> Templates
                </TabsTrigger>
              )}
              <TabsTrigger value="preset" className="gap-1.5 text-xs">
                <Database className="h-3.5 w-3.5" /> {widget ? 'Preset Source' : 'Manual'}
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5 text-xs">
                <Calculator className="h-3.5 w-3.5" /> Custom Formula
              </TabsTrigger>
              {widget && <div />}
            </TabsList>
          </div>

          {/* ═══ Template Gallery ═══ */}
          <TabsContent value="template" className="flex-1 overflow-hidden mt-0 px-6">
            <MetricTemplateGallery onSelect={handleTemplateSelect} existingDataSources={existingDataSources} />
          </TabsContent>

          {/* ═══ PRESET SOURCE ═══ */}
          <TabsContent value="preset" className="flex-1 overflow-hidden mt-0 px-6">
            <ScrollArea className="h-full">
              <div className="flex gap-5 pb-4 pt-3">
                {/* Left: form fields */}
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs">Widget Title</Label>
                    <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Widget title" className="h-8 text-sm" />
                  </div>

                  {/* Entity Scope */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Entity Scope</Label>
                    <Select value={entityFilter} onValueChange={setEntityFilter}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Entities" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Entities</SelectItem>
                        {qbConnections.map(c => (
                          <SelectItem key={c.realmId} value={c.realmId}>{c.companyName || c.realmId}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Widget Type</Label>
                      <Select value={type} onValueChange={v => { setType(v as MetricWidgetType); setDataSource(''); }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stat">Stat Card</SelectItem>
                          <SelectItem value="chart">Chart</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {type === 'chart' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Chart Type</Label>
                        <Select value={chartType} onValueChange={v => setChartType(v as MetricChartType)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{CHART_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Data Source</Label>
                    <Select value={dataSource} onValueChange={setDataSource}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select data source" /></SelectTrigger>
                      <SelectContent>{filteredDataSources.map(ds => <SelectItem key={ds.id} value={ds.id}>{ds.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {customMetrics.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Or use a saved custom metric</Label>
                      <div className="flex flex-wrap gap-1">
                        {customMetrics.map(m => (
                          <Badge key={m.id} variant={dataSource === `custom-${m.id}` ? 'default' : 'outline'} className="cursor-pointer text-[10px]"
                            onClick={() => { setDataSource(`custom-${m.id}`); setType('stat'); }}>
                            <Calculator className="h-2.5 w-2.5 mr-0.5" />{m.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Size</Label>
                      <Select value={size} onValueChange={v => setSize(v as MetricWidgetSize)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{SIZE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {type === 'stat' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Comparison</Label>
                        <Select value={comparisonPeriod} onValueChange={v => setComparisonPeriod(v as ComparisonPeriod)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="prev-month">vs Month</SelectItem>
                            <SelectItem value="prev-quarter">vs Quarter</SelectItem>
                            <SelectItem value="prev-year">vs Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Color picker: 8 swatches + custom hex */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Color</Label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_OPTIONS.map(opt => (
                        <button key={opt.value}
                          className={cn('h-6 w-6 rounded-full transition-all', opt.className, color === opt.value ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105')}
                          onClick={() => { setColor(opt.value); setCustomHex(''); }}
                          title={opt.label}
                        />
                      ))}
                      <div className="flex items-center gap-1 ml-1">
                        <Input className="h-6 w-20 text-[10px] px-1.5 font-mono" placeholder="#custom" value={customHex}
                          onChange={e => { setCustomHex(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setColor(e.target.value); }} />
                        {customHex && /^#[0-9a-fA-F]{6}$/.test(customHex) && (
                          <div className="h-6 w-6 rounded-full border" style={{ backgroundColor: customHex }} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Icon picker for stat cards */}
                  {type === 'stat' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Icon</Label>
                      <div className="flex gap-1.5">
                        {STAT_ICONS.map(ic => {
                          const IC = ic.icon;
                          return (
                            <button key={ic.value}
                              className={cn('h-7 w-7 rounded-md border flex items-center justify-center transition-all',
                                statIcon === ic.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}
                              onClick={() => setStatIcon(ic.value)} title={ic.label}>
                              <IC className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: live preview */}
                <div className="shrink-0">
                  <PreviewCard />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CUSTOM FORMULA ═══ */}
          <TabsContent value="custom" className="flex-1 overflow-hidden mt-0 px-6">
            <ScrollArea className="h-full">
              <div className="flex gap-5 pb-4 pt-3">
                {/* Left column: formula builder (60%) */}
                <div className="flex-[3] min-w-0 space-y-3">
                  <FormulaBuilder
                    value={formula}
                    onChange={setFormula}
                    availableWidgets={availableWidgets}
                    timeframe={timeframe}
                    onTimeframeChange={setTimeframe}
                    entityFilter={entityFilter}
                    onEntityFilterChange={setEntityFilter}
                    comparisonPeriod={comparisonPeriod}
                    onComparisonPeriodChange={setComparisonPeriod}
                    qbConnections={qbConnections}
                  />
                </div>

                {/* Right column: metadata + preview (40%) */}
                <div className="flex-[2] shrink-0 space-y-3 min-w-[200px]">
                  <PreviewCard />

                  <div className="space-y-1.5">
                    <Label htmlFor="title-custom" className="text-xs">Widget Title</Label>
                    <Input id="title-custom" value={title} onChange={e => setTitle(e.target.value)} placeholder="Widget title" className="h-8 text-sm" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="metric-name" className="text-xs">Metric Name</Label>
                    <Input id="metric-name" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g., Net Revenue" className="h-8 text-sm" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="metric-desc" className="text-xs">Description</Label>
                    <Textarea id="metric-desc" value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="Describe this metric…" className="min-h-[50px] text-xs" />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Result Format</Label>
                    <Select value={resultType} onValueChange={v => setResultType(v as FormulaResultType)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="currency">Currency ($)</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Size</Label>
                      <Select value={size} onValueChange={v => setSize(v as MetricWidgetSize)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{SIZE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Color</Label>
                      <div className="flex flex-wrap gap-1">
                        {COLOR_OPTIONS.slice(0, 4).map(opt => (
                          <button key={opt.value}
                            className={cn('h-5 w-5 rounded-full', opt.className, color === opt.value ? 'ring-2 ring-offset-1 ring-foreground' : '')}
                            onClick={() => setColor(opt.value)} title={opt.label} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {dataMode !== 'template' && (
          <DialogFooter className="px-6 pb-5 pt-3 border-t">
            <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
            <Button onClick={handleSave} disabled={!isValid} size="sm">
              {widget ? 'Save Changes' : 'Add Widget'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

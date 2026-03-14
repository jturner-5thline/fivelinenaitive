import { useState, useEffect } from 'react';
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
import { Calculator, Database, LayoutTemplate } from 'lucide-react';
import { 
  MetricWidgetConfig, 
  MetricWidgetType, 
  MetricChartType, 
  MetricWidgetSize,
  ComparisonPeriod,
  METRIC_WIDGET_DATA_SOURCES 
} from '@/contexts/MetricsWidgetsContext';
import { FormulaBuilder } from './FormulaBuilder';
import { MetricTemplateGallery } from './MetricTemplateGallery';
import { FormulaNode, FormulaResultType } from '@/lib/customMetricEngine';
import { useCustomMetrics } from '@/hooks/useCustomMetrics';
import { useQuickBooksStatus } from '@/hooks/useQuickBooks';

interface MetricWidgetEditorProps {
  widget?: MetricWidgetConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => void;
  availableWidgets?: { id: string; title: string }[];
  existingDataSources?: string[];
}

const SIZE_OPTIONS: { value: MetricWidgetSize; label: string }[] = [
  { value: 'small', label: 'Small (1/4 width)' },
  { value: 'medium', label: 'Medium (1/2 width)' },
  { value: 'large', label: 'Large (2/3 width)' },
  { value: 'full', label: 'Full width' },
];

const CHART_TYPE_OPTIONS: { value: MetricChartType; label: string }[] = [
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'composed', label: 'Composed Chart' },
  { value: 'waterfall', label: 'Waterfall Chart' },
  { value: 'gauge', label: 'Gauge Chart' },
  { value: 'bullet', label: 'Bullet Chart' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'funnel', label: 'Funnel Chart' },
  { value: 'radar', label: 'Radar Chart' },
  { value: 'heatmap', label: 'Heatmap Calendar' },
  { value: 'forecast', label: 'Forecast Trendline' },
];

const COLOR_OPTIONS = [
  { value: 'hsl(var(--primary))', label: 'Primary', className: 'bg-primary' },
  { value: 'hsl(var(--success))', label: 'Success', className: 'bg-success' },
  { value: 'hsl(var(--chart-2))', label: 'Blue', className: 'bg-chart-2' },
  { value: 'hsl(var(--chart-3))', label: 'Green', className: 'bg-chart-3' },
  { value: 'hsl(var(--chart-4))', label: 'Orange', className: 'bg-chart-4' },
  { value: 'hsl(var(--destructive))', label: 'Red', className: 'bg-destructive' },
];

type DataMode = 'template' | 'preset' | 'custom';

export function MetricWidgetEditor({ widget, isOpen, onClose, onSave, availableWidgets = [], existingDataSources = [] }: MetricWidgetEditorProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MetricWidgetType>('chart');
  const [chartType, setChartType] = useState<MetricChartType>('bar');
  const [dataSource, setDataSource] = useState('');
  const [size, setSize] = useState<MetricWidgetSize>('medium');
  const [color, setColor] = useState('hsl(var(--primary))');
  const [dataMode, setDataMode] = useState<DataMode>(widget ? 'preset' : 'template');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>('none');

  // Custom metric fields
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [formula, setFormula] = useState<FormulaNode | null>(null);
  const [resultType, setResultType] = useState<FormulaResultType>('number');
  const [selectedCustomMetricId, setSelectedCustomMetricId] = useState('');

  const { metrics: customMetrics, createMetric, updateMetric } = useCustomMetrics();
  const { data: qbStatus } = useQuickBooksStatus();

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
      setTitle('');
      setType('chart');
      setChartType('bar');
      setDataSource('');
      setSize('medium');
      setColor('hsl(var(--primary))');
      setDataMode('template');
      setCustomName('');
      setCustomDescription('');
      setFormula(null);
      setResultType('number');
      setSelectedCustomMetricId('');
      setEntityFilter('all');
      setComparisonPeriod('none');
    }
  }, [widget, isOpen, customMetrics]);

  const filteredDataSources = METRIC_WIDGET_DATA_SOURCES.filter(ds => ds.type === type);

  const handleTemplateSelect = (widgetData: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => {
    onSave(widgetData);
    onClose();
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    if (dataMode === 'custom') {
      if (!formula || !customName.trim()) return;

      try {
        let metricId = selectedCustomMetricId;
        if (metricId && customMetrics.find(m => m.id === metricId)) {
          await updateMetric.mutateAsync({
            id: metricId,
            name: customName.trim(),
            description: customDescription.trim() || undefined,
            formula,
            result_type: resultType,
          });
        } else {
          const result = await createMetric.mutateAsync({
            name: customName.trim(),
            description: customDescription.trim() || undefined,
            formula,
            result_type: resultType,
          });
          metricId = result.id;
        }

        onSave({
          title: title.trim(),
          type: 'stat',
          dataSource: `custom-${metricId}`,
          size,
          color,
          entityFilter: entityFilter !== 'all' ? entityFilter : undefined,
          comparisonPeriod: comparisonPeriod !== 'none' ? comparisonPeriod : undefined,
        });
      } catch {
        return;
      }
    } else {
      if (!dataSource) return;
      onSave({
        title: title.trim(),
        type,
        chartType: type === 'chart' ? chartType : undefined,
        dataSource,
        size,
        color,
        entityFilter: entityFilter !== 'all' ? entityFilter : undefined,
        comparisonPeriod: comparisonPeriod !== 'none' ? comparisonPeriod : undefined,
      });
    }
    onClose();
  };

  const isValid = dataMode === 'preset'
    ? title.trim() && dataSource
    : dataMode === 'custom'
    ? title.trim() && customName.trim() && formula
    : false;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{widget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>

        <Tabs value={dataMode} onValueChange={(v) => setDataMode(v as DataMode)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full grid grid-cols-3 shrink-0">
            {!widget && (
              <TabsTrigger value="template" className="gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5" /> Templates
              </TabsTrigger>
            )}
            <TabsTrigger value="preset" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> {widget ? 'Preset Source' : 'Manual'}
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> Custom Formula
            </TabsTrigger>
            {widget && <div />}
          </TabsList>

          {/* Template Gallery - quick add */}
          <TabsContent value="template" className="flex-1 overflow-hidden mt-3">
            <MetricTemplateGallery
              onSelect={handleTemplateSelect}
              existingDataSources={existingDataSources}
            />
          </TabsContent>

          {/* Manual Preset Source */}
          <TabsContent value="preset" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-4 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Widget Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
                </div>

                <div className="space-y-2">
                  <Label>Widget Type</Label>
                  <Select value={type} onValueChange={(v) => { setType(v as MetricWidgetType); setDataSource(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stat">Stat Card</SelectItem>
                      <SelectItem value="chart">Chart</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {type === 'chart' && (
                  <div className="space-y-2">
                    <Label>Chart Type</Label>
                    <Select value={chartType} onValueChange={(v) => setChartType(v as MetricChartType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHART_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Data Source</Label>
                  <Select value={dataSource} onValueChange={setDataSource}>
                    <SelectTrigger><SelectValue placeholder="Select data source" /></SelectTrigger>
                    <SelectContent>
                      {filteredDataSources.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id}>{ds.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {customMetrics.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Or use a saved custom metric</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {customMetrics.map((m) => (
                        <Badge
                          key={m.id}
                          variant={dataSource === `custom-${m.id}` ? 'default' : 'outline'}
                          className="cursor-pointer text-xs"
                          onClick={() => { setDataSource(`custom-${m.id}`); setType('stat'); }}
                        >
                          <Calculator className="h-3 w-3 mr-1" />{m.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={size} onValueChange={(v) => setSize(v as MetricWidgetSize)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`h-8 w-8 rounded-full ${opt.className} ${color === opt.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                        onClick={() => setColor(opt.value)}
                        title={opt.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Custom Formula */}
          <TabsContent value="custom" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-4 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="title-custom">Widget Title</Label>
                  <Input id="title-custom" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metric-name">Metric Name</Label>
                  <Input id="metric-name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g., Net Revenue, Win Rate, ROI" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="metric-desc">Description (optional)</Label>
                  <Textarea id="metric-desc" value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} placeholder="Describe what this metric calculates..." className="min-h-[60px]" />
                </div>

                <div className="space-y-2">
                  <Label>Result Format</Label>
                  <Select value={resultType} onValueChange={(v) => setResultType(v as FormulaResultType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="currency">Currency ($)</SelectItem>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <FormulaBuilder value={formula} onChange={setFormula} availableWidgets={availableWidgets} />

                <div className="space-y-2">
                  <Label>Size</Label>
                  <Select value={size} onValueChange={(v) => setSize(v as MetricWidgetSize)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={`h-8 w-8 rounded-full ${opt.className} ${color === opt.value ? 'ring-2 ring-offset-2 ring-foreground' : ''}`}
                        onClick={() => setColor(opt.value)}
                        title={opt.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {dataMode !== 'template' && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!isValid}>
              {widget ? 'Save Changes' : 'Add Widget'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

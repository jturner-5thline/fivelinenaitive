import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus,
  Trash2,
  BarChart3,
  Table as TableIcon,
  Hash,
  FileText,
  Loader2,
  Save,
  Eye,
  GripVertical,
  Sparkles,
} from 'lucide-react';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import {
  useSaveReportDefinition,
  METRIC_OPTIONS,
  DIMENSION_OPTIONS,
  CHART_TYPES,
  type ReportDefinition,
  type ReportWidget,
} from '@/hooks/useReportDefinitions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface LocalWidget {
  tempId: string;
  type: 'chart' | 'table' | 'kpi' | 'text' | 'ai_narrative';
  title: string;
  width: number;
  query_config: Record<string, any>;
  visualization_config: Record<string, any>;
}

const WIDGET_TYPES = [
  { type: 'chart' as const, label: 'Chart', icon: BarChart3, description: 'Bar, line, area, or pie chart' },
  { type: 'kpi' as const, label: 'KPI Tile', icon: Hash, description: 'Single number with label' },
  { type: 'table' as const, label: 'Data Table', icon: TableIcon, description: 'Tabular data view' },
  { type: 'text' as const, label: 'Text Block', icon: FileText, description: 'Markdown commentary' },
  { type: 'ai_narrative' as const, label: 'AI Summary', icon: () => <NaitiveIcon className="h-4 w-4" />, description: 'AI-generated narrative' },
];

interface ReportBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingReport?: ReportDefinition;
}

export function ReportBuilderDialog({ open, onOpenChange, existingReport }: ReportBuilderDialogProps) {
  const saveReport = useSaveReportDefinition();

  const [name, setName] = useState(existingReport?.name || '');
  const [description, setDescription] = useState(existingReport?.description || '');
  const [visibility, setVisibility] = useState(existingReport?.visibility || 'private');
  const [aiSummary, setAiSummary] = useState(existingReport?.ai_summary_enabled || false);
  const [aiRegenerate, setAiRegenerate] = useState(existingReport?.ai_regenerate_on_run ?? true);
  const [widgets, setWidgets] = useState<LocalWidget[]>(() => {
    if (existingReport?.report_widgets?.length) {
      return existingReport.report_widgets.map((w) => ({
        tempId: w.id,
        type: w.type as LocalWidget['type'],
        title: w.title || '',
        width: w.width,
        query_config: w.query_config || {},
        visualization_config: w.visualization_config || {},
      }));
    }
    return [];
  });
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);

  const addWidget = (type: LocalWidget['type']) => {
    const newWidget: LocalWidget = {
      tempId: `temp_${Date.now()}`,
      type,
      title: type === 'ai_narrative' ? 'AI Summary' : '',
      width: type === 'table' || type === 'ai_narrative' ? 2 : 1,
      query_config: type === 'kpi'
        ? { metric: 'deal_count' }
        : type === 'chart'
          ? { metric: 'deal_count', dimension: 'stage', chart_type: 'bar' }
          : type === 'table'
            ? { fields: ['company', 'stage', 'value', 'manager'], sort_by: 'value', sort_dir: 'desc' }
            : {},
      visualization_config: type === 'chart'
        ? { chart_type: 'bar', colors: ['hsl(var(--primary))'], show_legend: true }
        : {},
    };
    setWidgets((prev) => [...prev, newWidget]);
    setActiveWidgetId(newWidget.tempId);
  };

  const removeWidget = (tempId: string) => {
    setWidgets((prev) => prev.filter((w) => w.tempId !== tempId));
    if (activeWidgetId === tempId) setActiveWidgetId(null);
  };

  const updateWidget = (tempId: string, updates: Partial<LocalWidget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.tempId === tempId ? { ...w, ...updates } : w))
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a report name');
      return;
    }
    if (widgets.length === 0) {
      toast.error('Add at least one widget');
      return;
    }

    await saveReport.mutateAsync({
      definition: {
        id: existingReport?.id,
        name,
        description: description || null,
        visibility,
        ai_summary_enabled: aiSummary,
        ai_regenerate_on_run: aiRegenerate,
        data_sources: ['deals'],
        global_filters: {},
        layout_config: { columns: 2 },
      },
      widgets: widgets.map((w, i) => ({
        type: w.type,
        title: w.title || null,
        position: i,
        width: w.width,
        query_config: w.query_config,
        visualization_config: w.visualization_config,
        ai_annotation: null,
        ai_annotation_sources: null,
      })),
    });

    onOpenChange(false);
  };

  const activeWidget = widgets.find((w) => w.tempId === activeWidgetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{existingReport ? 'Edit Report' : 'New Custom Report'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Config */}
          <div className="w-80 border-r border-border flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {/* Report info */}
                <div className="space-y-2">
                  <Label>Report Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly Pipeline Summary" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Visibility</Label>
                  <Select value={visibility} onValueChange={setVisibility}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (Only me)</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="org">Organization</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* AI Settings */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <NaitiveIcon className="h-4 w-4" />
                    AI Features
                  </h4>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-normal">AI Summary Block</Label>
                    <Switch checked={aiSummary} onCheckedChange={setAiSummary} />
                  </div>
                  {aiSummary && (
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-normal">Regenerate on each run</Label>
                      <Switch checked={aiRegenerate} onCheckedChange={setAiRegenerate} />
                    </div>
                  )}
                </div>

                <Separator />

                {/* Add widgets */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Add Widget</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {WIDGET_TYPES.map((wt) => {
                      const Icon = wt.icon;
                      return (
                        <Button
                          key={wt.type}
                          variant="outline"
                          size="sm"
                          className="h-auto py-2 px-2 flex flex-col items-center gap-1 text-xs"
                          onClick={() => addWidget(wt.type)}
                        >
                          <Icon className="h-4 w-4" />
                          {wt.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Widget list */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Widgets ({widgets.length})</h4>
                  {widgets.map((w, i) => (
                    <div
                      key={w.tempId}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm',
                        activeWidgetId === w.tempId
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                      onClick={() => setActiveWidgetId(w.tempId)}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{w.title || `${w.type} ${i + 1}`}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {w.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWidget(w.tempId);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {widgets.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Add widgets to build your report
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Right: Widget config + preview */}
          <div className="flex-1 flex flex-col">
            {activeWidget ? (
              <ScrollArea className="flex-1 p-6">
                <WidgetConfig
                  widget={activeWidget}
                  onChange={(updates) => updateWidget(activeWidget.tempId, updates)}
                />
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <BarChart3 className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm">Select a widget to configure it, or add a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
            {aiSummary && ' + AI summary'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveReport.isPending || !name.trim() || widgets.length === 0}
              className="gap-2"
            >
              {saveReport.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {existingReport ? 'Update Report' : 'Save Report'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Widget Configuration Panel
function WidgetConfig({
  widget,
  onChange,
}: {
  widget: LocalWidget;
  onChange: (updates: Partial<LocalWidget>) => void;
}) {
  const updateQueryConfig = (key: string, value: any) => {
    onChange({ query_config: { ...widget.query_config, [key]: value } });
  };

  const updateVisConfig = (key: string, value: any) => {
    onChange({ visualization_config: { ...widget.visualization_config, [key]: value } });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Widget Title</Label>
        <Input
          value={widget.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. Pipeline by Stage"
        />
      </div>

      <div className="space-y-2">
        <Label>Width</Label>
        <Select value={String(widget.width)} onValueChange={(v) => onChange({ width: parseInt(v) })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Half width</SelectItem>
            <SelectItem value="2">Full width</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {widget.type === 'chart' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {CHART_TYPES.map((ct) => (
                <Button
                  key={ct.id}
                  variant={widget.visualization_config.chart_type === ct.id ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => updateVisConfig('chart_type', ct.id)}
                >
                  <span>{ct.icon}</span>
                  {ct.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Metric</Label>
            <Select value={widget.query_config.metric || ''} onValueChange={(v) => updateQueryConfig('metric', v)}>
              <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Group By</Label>
            <Select value={widget.query_config.dimension || ''} onValueChange={(v) => updateQueryConfig('dimension', v)}>
              <SelectTrigger><SelectValue placeholder="Select dimension" /></SelectTrigger>
              <SelectContent>
                {DIMENSION_OPTIONS.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Show Legend</Label>
            <Switch
              checked={widget.visualization_config.show_legend ?? true}
              onCheckedChange={(v) => updateVisConfig('show_legend', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Show Labels</Label>
            <Switch
              checked={widget.visualization_config.show_labels ?? false}
              onCheckedChange={(v) => updateVisConfig('show_labels', v)}
            />
          </div>
        </div>
      )}

      {widget.type === 'kpi' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Metric</Label>
            <Select value={widget.query_config.metric || ''} onValueChange={(v) => updateQueryConfig('metric', v)}>
              <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Show Comparison</Label>
            <Switch
              checked={widget.visualization_config.show_comparison ?? false}
              onCheckedChange={(v) => updateVisConfig('show_comparison', v)}
            />
          </div>
        </div>
      )}

      {widget.type === 'table' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Columns</Label>
            <div className="space-y-1">
              {['company', 'stage', 'status', 'value', 'manager', 'lender_count', 'created_at', 'total_fee'].map((field) => {
                const isSelected = (widget.query_config.fields || []).includes(field);
                return (
                  <div key={field} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const currentFields = widget.query_config.fields || [];
                        const newFields = isSelected
                          ? currentFields.filter((f: string) => f !== field)
                          : [...currentFields, field];
                        updateQueryConfig('fields', newFields);
                      }}
                      className="rounded"
                    />
                    <span className="text-sm capitalize">{field.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Sort By</Label>
            <Select value={widget.query_config.sort_by || 'value'} onValueChange={(v) => updateQueryConfig('sort_by', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="value">Value</SelectItem>
                <SelectItem value="created_at">Created Date</SelectItem>
                <SelectItem value="stage">Stage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Max Rows</Label>
            <Select value={String(widget.query_config.limit || 25)} onValueChange={(v) => updateQueryConfig('limit', parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {widget.type === 'text' && (
        <div className="space-y-2">
          <Label>Content (Markdown)</Label>
          <Textarea
            value={widget.query_config.content || ''}
            onChange={(e) => updateQueryConfig('content', e.target.value)}
            placeholder="Add commentary, notes, or context..."
            rows={6}
          />
        </div>
      )}

      {widget.type === 'ai_narrative' && (
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <NaitiveIcon className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">AI Narrative Block</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This widget will be auto-generated by AI based on the report data. 
                    It will summarize key trends, changes, and insights.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-2">
            <Label>Focus Area</Label>
            <Select value={widget.query_config.focus || 'overview'} onValueChange={(v) => updateQueryConfig('focus', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">Full Overview</SelectItem>
                <SelectItem value="pipeline">Pipeline Changes</SelectItem>
                <SelectItem value="lender">Funding Source Activity</SelectItem>
                <SelectItem value="risks">Risk Highlights</SelectItem>
                <SelectItem value="performance">Performance Metrics</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

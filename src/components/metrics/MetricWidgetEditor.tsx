import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { 
  MetricWidgetConfig, 
  MetricWidgetType, 
  MetricChartType, 
  MetricWidgetSize,
  METRIC_WIDGET_DATA_SOURCES 
} from '@/contexts/MetricsWidgetsContext';

interface MetricWidgetEditorProps {
  widget?: MetricWidgetConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: Omit<MetricWidgetConfig, 'id' | 'createdAt'>) => void;
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
];

const COLOR_OPTIONS = [
  { value: 'hsl(var(--primary))', label: 'Primary', className: 'bg-primary' },
  { value: 'hsl(var(--success))', label: 'Success', className: 'bg-success' },
  { value: 'hsl(var(--chart-2))', label: 'Blue', className: 'bg-chart-2' },
  { value: 'hsl(var(--chart-3))', label: 'Green', className: 'bg-chart-3' },
  { value: 'hsl(var(--chart-4))', label: 'Orange', className: 'bg-chart-4' },
  { value: 'hsl(var(--destructive))', label: 'Red', className: 'bg-destructive' },
];

export function MetricWidgetEditor({ widget, isOpen, onClose, onSave }: MetricWidgetEditorProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MetricWidgetType>('chart');
  const [chartType, setChartType] = useState<MetricChartType>('bar');
  const [dataSource, setDataSource] = useState('');
  const [size, setSize] = useState<MetricWidgetSize>('medium');
  const [color, setColor] = useState('hsl(var(--primary))');

  useEffect(() => {
    if (widget) {
      setTitle(widget.title);
      setType(widget.type);
      setChartType(widget.chartType || 'bar');
      setDataSource(widget.dataSource);
      setSize(widget.size);
      setColor(widget.color);
    } else {
      setTitle('');
      setType('chart');
      setChartType('bar');
      setDataSource('');
      setSize('medium');
      setColor('hsl(var(--primary))');
    }
  }, [widget, isOpen]);

  const filteredDataSources = METRIC_WIDGET_DATA_SOURCES.filter(ds => ds.type === type);

  const handleSave = () => {
    if (!title.trim() || !dataSource) return;
    onSave({ 
      title: title.trim(), 
      type, 
      chartType: type === 'chart' ? chartType : undefined, 
      dataSource, 
      size, 
      color 
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{widget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Widget title"
            />
          </div>

          <div className="space-y-2">
            <Label>Widget Type</Label>
            <Select value={type} onValueChange={(v) => {
              setType(v as MetricWidgetType);
              setDataSource('');
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Data Source</Label>
            <Select value={dataSource} onValueChange={setDataSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select data source" />
              </SelectTrigger>
              <SelectContent>
                {filteredDataSources.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Size</Label>
            <Select value={size} onValueChange={(v) => setSize(v as MetricWidgetSize)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
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
                  className={`h-8 w-8 rounded-full ${opt.className} ${
                    color === opt.value ? 'ring-2 ring-offset-2 ring-foreground' : ''
                  }`}
                  onClick={() => setColor(opt.value)}
                  title={opt.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || !dataSource}>
            {widget ? 'Save Changes' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

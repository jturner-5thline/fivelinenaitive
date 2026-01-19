import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, TrendingUp, TrendingDown, DollarSign, Percent, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MetricWidgetConfig, MetricWidgetSize } from '@/contexts/MetricsWidgetsContext';
import { cn } from '@/lib/utils';

interface SortableMetricWidgetProps {
  widget: MetricWidgetConfig;
  children: React.ReactNode;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResize?: (size: MetricWidgetSize) => void;
}

const sizeClasses: Record<MetricWidgetSize, string> = {
  small: 'col-span-1',
  medium: 'col-span-1 md:col-span-2',
  large: 'col-span-1 md:col-span-2 lg:col-span-3',
  full: 'col-span-1 md:col-span-2 lg:col-span-4',
};

export function SortableMetricWidget({ 
  widget, 
  children, 
  isEditMode, 
  onEdit, 
  onDelete,
}: SortableMetricWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        sizeClasses[widget.size],
        'group relative transition-all duration-200',
        isDragging && 'opacity-50 z-50 shadow-lg',
        isEditMode && 'ring-1 ring-dashed ring-muted-foreground/30'
      )}
    >
      {isEditMode && (
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      {children}
    </Card>
  );
}

// Stat card content component
interface StatWidgetContentProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: 'pipeline' | 'trending-up' | 'dollar' | 'percent';
  color: string;
}

const iconMap = {
  pipeline: Building2,
  'trending-up': TrendingUp,
  dollar: DollarSign,
  percent: Percent,
};

export function StatWidgetContent({ title, value, subtitle, icon, color }: StatWidgetContentProps) {
  const Icon = iconMap[icon];
  
  return (
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="p-2 rounded-full" style={{ backgroundColor: `${color}20` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
      )}
    </CardContent>
  );
}

// Chart wrapper component
interface ChartWidgetContentProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ChartWidgetContent({ title, description, children, footer }: ChartWidgetContentProps) {
  return (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
        {footer}
      </CardContent>
    </>
  );
}

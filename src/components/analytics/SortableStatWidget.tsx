import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WidgetConfig, WidgetDataSource } from '@/contexts/AnalyticsWidgetsContext';
import { cn } from '@/lib/utils';

interface HoursData {
  totalPreSigning: number;
  totalPostSigning: number;
  totalHours: number;
  totalFees: number;
  totalRetainer: number;
  totalMilestone: number;
  avgSuccessFee: number;
  revenuePerHour: number;
  byManager: {
    name: string;
    preSigning: number;
    postSigning: number;
    total: number;
    fees: number;
    revenuePerHour: number;
  }[];
  byStage: {
    name: string;
    preSigning: number;
    postSigning: number;
    total: number;
    fees: number;
    revenuePerHour: number;
  }[];
}

interface SortableStatWidgetProps {
  widget: WidgetConfig;
  hoursData: HoursData;
  onEdit: (widget: WidgetConfig) => void;
  onDelete: (widgetId: string) => void;
}

const getWidgetValue = (dataSource: WidgetDataSource, hoursData: HoursData): string => {
  switch (dataSource) {
    case 'pre-signing-hours':
      return hoursData.totalPreSigning.toFixed(1);
    case 'post-signing-hours':
      return hoursData.totalPostSigning.toFixed(1);
    case 'total-hours':
      return hoursData.totalHours.toFixed(1);
    case 'total-fees':
      return `$${hoursData.totalFees.toLocaleString()}`;
    case 'revenue-per-hour':
      return hoursData.revenuePerHour > 0 
        ? `$${hoursData.revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : '-';
    case 'total-retainer':
      return `$${hoursData.totalRetainer.toLocaleString('en-US')}`;
    case 'total-milestone':
      return `$${hoursData.totalMilestone.toLocaleString('en-US')}`;
    case 'avg-success-fee':
      return hoursData.avgSuccessFee > 0 ? `${hoursData.avgSuccessFee.toFixed(1)}%` : '-';
    default:
      return '-';
  }
};

export function SortableStatWidget({ widget, hoursData, onEdit, onDelete }: SortableStatWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const value = getWidgetValue(widget.dataSource, hoursData);

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "group relative",
        isDragging && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      <CardContent className="pt-6">
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-1"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={() => onEdit(widget)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onDelete(widget.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{widget.title}</p>
          <p className={cn(
            "font-bold bg-brand-gradient bg-clip-text text-transparent",
            widget.size === 'small' ? "text-3xl" : "text-2xl"
          )}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

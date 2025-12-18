import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface SortableListWidgetProps {
  widget: WidgetConfig;
  hoursData: HoursData;
  onEdit: (widget: WidgetConfig) => void;
  onDelete: (widgetId: string) => void;
}

export function SortableListWidget({ widget, hoursData, onEdit, onDelete }: SortableListWidgetProps) {
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

  const data = widget.dataSource === 'hours-by-manager' ? hoursData.byManager : hoursData.byStage;
  const isStage = widget.dataSource === 'hours-by-stage';

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "group relative",
        isDragging && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <CardTitle className="text-lg">{widget.title}</CardTitle>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => onEdit(widget)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(widget.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.length > 0 ? (
            data.map((item) => (
              <div key={item.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className={cn("font-medium", isStage && "capitalize")}>
                  {isStage ? item.name.replace('-', ' ') : item.name}
                </span>
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">{item.total.toFixed(1)}h</span>
                  <span className="text-muted-foreground">${item.fees.toLocaleString()}</span>
                  <span className="font-semibold bg-brand-gradient bg-clip-text text-transparent">
                    {item.revenuePerHour > 0 ? `$${item.revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr` : '-'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-center py-4">No hours recorded yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

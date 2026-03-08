import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WidgetConfig, WidgetDataSource } from '@/contexts/AnalyticsWidgetsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
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
  dealsWithHoursCount: number;
  avgHoursPerDeal: number;
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
  compact?: boolean;
  delta?: number | null;
}

const getWidgetValue = (dataSource: WidgetDataSource, hoursData: HoursData, formatCurrency: (value: number) => string): string => {
  switch (dataSource) {
    case 'pre-signing-hours':
      return hoursData.totalPreSigning.toFixed(1);
    case 'post-signing-hours':
      return hoursData.totalPostSigning.toFixed(1);
    case 'total-hours':
      return hoursData.totalHours.toFixed(1);
    case 'total-fees':
      return formatCurrency(hoursData.totalFees);
    case 'revenue-per-hour':
      return hoursData.revenuePerHour > 0 
        ? `$${hoursData.revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}/hr`
        : '-';
    case 'avg-hours-per-deal':
      return hoursData.avgHoursPerDeal > 0 
        ? hoursData.avgHoursPerDeal.toFixed(1)
        : '-';
    case 'total-retainer':
      return formatCurrency(hoursData.totalRetainer);
    case 'total-milestone':
      return formatCurrency(hoursData.totalMilestone);
    case 'avg-success-fee':
      return hoursData.avgSuccessFee > 0 ? `${hoursData.avgSuccessFee.toFixed(1)}%` : '-';
    default:
      return '-';
  }
};

const getWidgetRawValue = (dataSource: WidgetDataSource, hoursData: HoursData): number => {
  switch (dataSource) {
    case 'pre-signing-hours': return hoursData.totalPreSigning;
    case 'post-signing-hours': return hoursData.totalPostSigning;
    case 'total-hours': return hoursData.totalHours;
    case 'total-fees': return hoursData.totalFees;
    case 'revenue-per-hour': return hoursData.revenuePerHour;
    case 'avg-hours-per-deal': return hoursData.avgHoursPerDeal;
    case 'total-retainer': return hoursData.totalRetainer;
    case 'total-milestone': return hoursData.totalMilestone;
    case 'avg-success-fee': return hoursData.avgSuccessFee;
    default: return 0;
  }
};

// Deterministic mock delta for demo purposes
export const getWidgetDelta = (dataSource: WidgetDataSource, hoursData: HoursData): number | null => {
  const rawValue = getWidgetRawValue(dataSource, hoursData);
  if (rawValue === 0) return null;
  const hash = dataSource.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((hash % 30) - 10); // range: -10 to +19
};

export function SortableStatWidget({ widget, hoursData, onEdit, onDelete, compact = false, delta }: SortableStatWidgetProps) {
  const { formatCurrencyValue } = usePreferences();
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

  const value = getWidgetValue(widget.dataSource, hoursData, formatCurrencyValue);
  const effectiveDelta = delta ?? getWidgetDelta(widget.dataSource, hoursData);

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "group relative transition-all duration-300",
        isDragging && "shadow-lg ring-2 ring-primary/20"
      )}
    >
      <CardContent className={cn("pt-6", compact && "pt-4 pb-4")}>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <button
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-1"
            {...attributes}
            {...listeners}
          >
            <GripVertical className={cn("h-4 w-4", compact && "h-3 w-3")} />
          </button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-6 w-6", compact && "h-5 w-5")}
            onClick={() => onEdit(widget)}
          >
            <Pencil className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("h-6 w-6 text-destructive hover:text-destructive", compact && "h-5 w-5")}
            onClick={() => onDelete(widget.id)}
          >
            <Trash2 className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
          </Button>
        </div>
        <div className="text-center">
          <p className={cn(
            "text-muted-foreground",
            compact ? "text-xs" : "text-sm"
          )}>{widget.title}</p>
          <p className={cn(
            "font-bold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white",
            compact ? "text-xl" : (widget.size === 'small' ? "text-3xl" : "text-2xl")
          )}>
            {value}
          </p>
          {effectiveDelta !== null && effectiveDelta !== 0 && (
            <div className={cn(
              "flex items-center justify-center gap-0.5 mt-1",
              effectiveDelta > 0 ? "text-emerald-500" : "text-destructive"
            )}>
              {effectiveDelta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span className={cn("font-medium", compact ? "text-[10px]" : "text-xs")}>
                {effectiveDelta > 0 ? '+' : ''}{effectiveDelta.toFixed(0)}% vs prior
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

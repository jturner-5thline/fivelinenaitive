import { Pencil, Trash2, GripVertical, TrendingUp, Briefcase, FileSearch, DollarSign, Target, CheckCircle, AlertTriangle, BarChart3 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Widget, WidgetMetric } from '@/contexts/WidgetsContext';

interface WidgetCardProps {
  widget: Widget;
  value: string | number;
  isEditMode: boolean;
  isClickable?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClick?: () => void;
}

const metricIcons: Record<WidgetMetric, typeof TrendingUp> = {
  'active-deals': Briefcase,
  'active-deal-volume': TrendingUp,
  'deals-in-diligence': FileSearch,
  'dollars-in-diligence': DollarSign,
  'total-deals': BarChart3,
  'archived-deals': CheckCircle,
  'on-track-deals': Target,
  'at-risk-deals': AlertTriangle,
  'total-pipeline-value': TrendingUp,
  'average-deal-size': DollarSign,
};

const colorClasses: Record<Widget['color'], { text: string; bg: string }> = {
  primary: { text: 'text-primary', bg: 'bg-primary/10' },
  accent: { text: 'text-accent', bg: 'bg-accent/10' },
  success: { text: 'text-success', bg: 'bg-success/10' },
  warning: { text: 'text-warning', bg: 'bg-warning/10' },
  destructive: { text: 'text-destructive', bg: 'bg-destructive/10' },
};

export function WidgetCard({ widget, value, isEditMode, isClickable, onEdit, onDelete, onClick }: WidgetCardProps) {
  const Icon = metricIcons[widget.metric];
  const colors = colorClasses[widget.color];

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
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    if (!isEditMode && isClickable && onClick) {
      onClick();
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'z-50 opacity-50' : ''} ${isClickable && !isEditMode ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={handleClick}
    >
      {isEditMode && (
        <>
          <button
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-destructive hover:border-destructive hover:text-destructive-foreground"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-2 w-2" />
          </button>
          <button
            className="absolute top-1/2 -left-1.5 -translate-y-1/2 h-4 w-4 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-2 w-2" />
          </button>
          <button
            className="absolute -bottom-1.5 right-1/2 translate-x-1/2 h-4 w-4 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-primary hover:border-primary hover:text-primary-foreground"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-2 w-2" />
          </button>
        </>
      )}
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colors.bg} flex-shrink-0`}>
          <Icon className={`h-6 w-6 ${colors.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground truncate">{widget.label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

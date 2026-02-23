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

const colorClasses: Record<Widget['color'], { text: string; bg: string; glow: string }> = {
  primary: { text: 'text-primary', bg: 'bg-primary/15 border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.2),inset_0_1px_1px_hsl(var(--primary)/0.15)]', glow: 'before:from-primary/20 before:to-transparent' },
  accent: { text: 'text-accent', bg: 'bg-accent/15 border-accent/30 shadow-[0_0_12px_hsl(var(--accent)/0.2),inset_0_1px_1px_hsl(var(--accent)/0.15)]', glow: 'before:from-accent/20 before:to-transparent' },
  success: { text: 'text-success', bg: 'bg-success/15 border-success/30 shadow-[0_0_12px_hsl(var(--success)/0.2),inset_0_1px_1px_hsl(var(--success)/0.15)]', glow: 'before:from-success/20 before:to-transparent' },
  warning: { text: 'text-warning', bg: 'bg-warning/15 border-warning/30 shadow-[0_0_12px_hsl(var(--warning)/0.2),inset_0_1px_1px_hsl(var(--warning)/0.15)]', glow: 'before:from-warning/20 before:to-transparent' },
  destructive: { text: 'text-destructive', bg: 'bg-destructive/15 border-destructive/30 shadow-[0_0_12px_hsl(var(--destructive)/0.2),inset_0_1px_1px_hsl(var(--destructive)/0.15)]', glow: 'before:from-destructive/20 before:to-transparent' },
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
      className={`relative group border border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(222,30%,18%)_0%,hsl(230,25%,14%)_50%,hsl(238,22%,11%)_100%)] backdrop-blur-xl shadow-[inset_0_1px_2px_hsl(272,100%,80%,0.15),inset_0_-1px_1px_hsl(0,0%,0%,0.2),0_0_12px_hsl(272,100%,70%,0.1),0_6px_28px_hsl(0,0%,0%,0.5)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,75%,0.08)_0%,transparent_40%,hsl(268,60%,50%,0.04)_100%)] transition-all duration-200 hover:border-[hsl(272,100%,80%,0.55)] hover:shadow-[inset_0_1px_2px_hsl(272,100%,85%,0.2),inset_0_-1px_1px_hsl(0,0%,0%,0.25),0_0_20px_hsl(272,100%,70%,0.18),0_10px_40px_hsl(0,0%,0%,0.6)] ${isDragging ? 'z-50 opacity-50' : ''} ${isClickable && !isEditMode ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      onClick={handleClick}
    >
      {isEditMode && (
        <div className="absolute -top-2 -left-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-2.5 w-2.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-lg border backdrop-blur-sm flex-shrink-0 overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:rounded-lg ${colors.bg} ${colors.glow}`}>
          <Icon className={`relative z-10 h-6 w-6 ${colors.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/60 truncate">{widget.label}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

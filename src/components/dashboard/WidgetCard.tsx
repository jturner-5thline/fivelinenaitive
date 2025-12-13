import { Pencil, Trash2, TrendingUp, Briefcase, FileSearch, DollarSign, Target, CheckCircle, AlertTriangle, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Widget, WidgetMetric } from '@/contexts/WidgetsContext';

interface WidgetCardProps {
  widget: Widget;
  value: string | number;
  isEditMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
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

export function WidgetCard({ widget, value, isEditMode, onEdit, onDelete }: WidgetCardProps) {
  const Icon = metricIcons[widget.metric];
  const colors = colorClasses[widget.color];

  return (
    <Card className={`relative ${isEditMode ? 'ring-2 ring-primary/50' : ''}`}>
      {isEditMode && (
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colors.bg}`}>
          <Icon className={`h-6 w-6 ${colors.text}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{widget.label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

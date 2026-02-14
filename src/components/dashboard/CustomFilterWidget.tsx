import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, isToday, isPast, addDays } from 'date-fns';
import { BarChart3, Briefcase, ListTodo, AlertCircle, Clock, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { Deal, STATUS_CONFIG, STAGE_CONFIG } from '@/types/deal';

interface CustomFilterWidgetProps {
  config?: {
    dataSource?: 'deals' | 'tasks' | 'alerts';
    title?: string;
    filters?: {
      status?: string[];
      stage?: string[];
      managerOnly?: boolean;
      dueWithin?: number; // days
      overdueOnly?: boolean;
    };
    displayFields?: string[];
    maxItems?: number;
  };
}

export default function CustomFilterWidget({ config }: CustomFilterWidgetProps) {
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { profile } = useProfile();
  const { milestones } = useAllMilestones();

  const dataSource = config?.dataSource || 'deals';
  const title = config?.title || 'Custom View';
  const filters = config?.filters || {};
  const maxItems = config?.maxItems || 10;

  const filteredDeals = useMemo(() => {
    if (dataSource !== 'deals') return [];
    let result = [...deals];
    
    if (filters.managerOnly && profile) {
      const name = profile.display_name || profile.first_name || '';
      result = result.filter(d => d.manager?.toLowerCase() === name.toLowerCase());
    }
    if (filters.status?.length) {
      result = result.filter(d => filters.status!.includes(d.status));
    }
    if (filters.stage?.length) {
      result = result.filter(d => filters.stage!.includes(d.stage));
    }
    return result.slice(0, maxItems);
  }, [deals, dataSource, filters, profile, maxItems]);

  const filteredTasks = useMemo(() => {
    if (dataSource !== 'tasks') return [];
    let result = milestones.filter(m => !m.completed);
    
    if (filters.overdueOnly) {
      result = result.filter(m => m.due_date && isPast(new Date(m.due_date)) && !isToday(new Date(m.due_date)));
    }
    if (filters.dueWithin) {
      const cutoff = addDays(new Date(), filters.dueWithin);
      result = result.filter(m => m.due_date && new Date(m.due_date) <= cutoff);
    }
    return result.slice(0, maxItems);
  }, [milestones, dataSource, filters, maxItems]);

  const Icon = dataSource === 'deals' ? Briefcase : dataSource === 'tasks' ? ListTodo : BarChart3;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          <Badge variant="outline" className="text-[10px]">Custom</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {dataSource === 'deals' && (
            <div className="space-y-1">
              {filteredDeals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No deals match filters.</p>
              ) : filteredDeals.map(deal => (
                <button
                  key={deal.id}
                  onClick={() => navigate(`/deal/${deal.id}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${STATUS_CONFIG[deal.status as keyof typeof STATUS_CONFIG]?.dotColor || 'bg-muted'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{deal.company}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {STAGE_CONFIG[deal.stage as keyof typeof STAGE_CONFIG]?.label || deal.stage}
                      </Badge>
                      <span>{formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
          {dataSource === 'tasks' && (
            <div className="space-y-1">
              {filteredTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tasks match filters.</p>
              ) : filteredTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => navigate(`/deal/${task.deal_id}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                >
                  <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{task.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-primary font-medium">{task.deal_company}</span>
                      {task.due_date && <span><Clock className="h-3 w-3 inline mr-0.5" />{new Date(task.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

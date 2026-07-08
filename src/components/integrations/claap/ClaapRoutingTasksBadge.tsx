import { useState } from 'react';
import { useClaapRoutingTasks, ClaapRoutingTask } from '@/hooks/useClaapMeetings';
import {
  ContactConfirmationDialog,
  CompanyConfirmationDialog,
  DealCreationDialog,
  DealDisambiguationDialog,
} from './ClaapRoutingTaskDialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Video, Bell, ChevronRight, User, Building2, Briefcase, AlertCircle } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

const TASK_TYPE_CONFIG = {
  confirm_contact: { icon: User, label: 'Confirm Contact', color: 'text-blue-500' },
  confirm_company: { icon: Building2, label: 'Confirm Company', color: 'text-emerald-500' },
  create_deal: { icon: Briefcase, label: 'Create Deal', color: 'text-purple-500' },
  disambiguate_deal: { icon: AlertCircle, label: 'Select Deal', color: 'text-amber-500' },
};

export function ClaapRoutingTasksBadge() {
  const { data: tasks = [] } = useClaapRoutingTasks();
  const [activeTask, setActiveTask] = useState<ClaapRoutingTask | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Hidden per product request — the "Meeting Tasks" pill and its
  // notification badge should not render anywhere in the app.
  return null;
  // eslint-disable-next-line no-unreachable
  if (tasks.length === 0) return null;

  const renderDialog = () => {
    if (!activeTask) return null;
    const common = { task: activeTask, open: !!activeTask, onOpenChange: (o: boolean) => { if (!o) setActiveTask(null); } };

    switch (activeTask.task_type) {
      case 'confirm_contact': return <ContactConfirmationDialog {...common} />;
      case 'confirm_company': return <CompanyConfirmationDialog {...common} />;
      case 'create_deal': return <DealCreationDialog {...common} />;
      case 'disambiguate_deal': return <DealDisambiguationDialog {...common} />;
      default: return null;
    }
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative h-8 gap-1.5">
            <Video className="h-4 w-4" />
            <span className="text-xs">Meeting Tasks</span>
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] absolute -top-1 -right-1">
              {tasks.length}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="px-3 py-2 border-b">
            <p className="font-medium text-sm">Claap Meeting Tasks</p>
            <p className="text-xs text-muted-foreground">{tasks.length} pending action{tasks.length !== 1 ? 's' : ''}</p>
          </div>
          <ScrollArea className="max-h-[300px]">
            {tasks.map(task => {
              const config = TASK_TYPE_CONFIG[task.task_type];
              const Icon = config.icon;
              return (
                <button
                  key={task.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0"
                  onClick={() => { setActiveTask(task); setPopoverOpen(false); }}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{config.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {renderDialog()}
    </>
  );
}

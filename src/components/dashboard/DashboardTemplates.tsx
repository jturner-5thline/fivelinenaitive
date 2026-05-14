import { useState, useRef } from 'react';
import { ListTodo, Bell, Mail, Activity, Newspaper, Zap, Bot, LayoutTemplate, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GridItem, WidgetConfig } from '@/hooks/useDashboardPresets';
import { cn } from '@/lib/utils';

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  widgets: WidgetConfig[];
  grid: GridItem[];
  tags: string[];
}

const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'executive-overview',
    name: 'Executive Overview',
    description: 'High-level view with notifications, recent activity, and news. Great for leadership staying informed.',
    icon: Activity,
    tags: ['Activity', 'News', 'Notifications'],
    widgets: [
      { id: 'notifications', type: 'notifications', title: 'Notifications', config: {} },
      { id: 'my-deals', type: 'my-deals', title: 'My Deals', config: { maxItems: 5, variant: 'compact' } },
      { id: 'recent-activity', type: 'recent-activity', title: 'Recent Activity', config: {} },
      { id: 'news-feed', type: 'news-feed', title: 'News Feed', config: {} },
    ],
    grid: [
      { i: 'notifications', x: 0, y: 0, w: 12, h: 5, minW: 6, minH: 4 },
      { i: 'my-deals', x: 0, y: 5, w: 6, h: 5, minW: 3, minH: 3 },
      { i: 'recent-activity', x: 6, y: 5, w: 6, h: 5, minW: 3, minH: 3 },
      { i: 'news-feed', x: 0, y: 10, w: 12, h: 5, minW: 3, minH: 3 },
    ],
  },
  {
    id: 'ai-powered',
    name: 'AI-Powered',
    description: 'Leverage AI with workflow suggestions, agent recommendations, and smart email insights.',
    icon: Sparkles,
    tags: ['AI', 'Automation', 'Intelligence'],
    widgets: [
      { id: 'workflow-suggestions', type: 'workflow-suggestions', title: 'Workflow Suggestions', config: {} },
      { id: 'agent-suggestions', type: 'agent-suggestions', title: 'Agent Suggestions', config: {} },
      { id: 'email-intelligence', type: 'email-intelligence', title: 'Email Intelligence', config: {} },
      { id: 'my-deals', type: 'my-deals', title: 'My Deals', config: { maxItems: 10 } },
    ],
    grid: [
      { i: 'workflow-suggestions', x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: 'agent-suggestions', x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: 'email-intelligence', x: 0, y: 4, w: 4, h: 4, minW: 3, minH: 2 },
      { i: 'my-deals', x: 4, y: 4, w: 8, h: 5, minW: 3, minH: 3 },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, distraction-free layout with just deals and tasks. Start lean and add more later.',
    icon: ListTodo,
    tags: ['Clean', 'Simple'],
    widgets: [
      { id: 'my-deals', type: 'my-deals', title: 'My Deals', config: { maxItems: 10, variant: 'expanded' } },
      { id: 'my-tasks', type: 'my-tasks', title: 'My Tasks', config: { variant: 'expanded' } },
    ],
    grid: [
      { i: 'my-deals', x: 0, y: 0, w: 6, h: 8, minW: 3, minH: 3 },
      { i: 'my-tasks', x: 6, y: 0, w: 6, h: 8, minW: 3, minH: 3 },
    ],
  },
];

interface DashboardTemplatesDialogProps {
  /** If 'replace' mode, calls onApplyToCurrentDashboard instead of onSelectTemplate */
  mode?: 'create' | 'replace';
  onSelectTemplate: (name: string, grid: GridItem[], widgets: WidgetConfig[]) => void;
  onApplyToCurrentDashboard?: (grid: GridItem[], widgets: WidgetConfig[]) => void;
  trigger?: React.ReactNode;
}

export function DashboardTemplatesDialog({ mode = 'create', onSelectTemplate, onApplyToCurrentDashboard, trigger }: DashboardTemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleApply = () => {
    const template = DASHBOARD_TEMPLATES.find(t => t.id === selectedId);
    if (!template) return;

    if (mode === 'replace' && onApplyToCurrentDashboard) {
      // Show confirmation before replacing current dashboard widgets
      setShowConfirm(true);
    } else {
      onSelectTemplate(template.name, template.grid, template.widgets);
      setOpen(false);
      setSelectedId(null);
    }
  };

  const handleConfirmReplace = () => {
    const template = DASHBOARD_TEMPLATES.find(t => t.id === selectedId);
    if (!template) return;
    if (onApplyToCurrentDashboard) {
      onApplyToCurrentDashboard(template.grid, template.widgets);
    }
    setShowConfirm(false);
    setOpen(false);
    setSelectedId(null);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 280;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Templates
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[750px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Choose a Dashboard Template</DialogTitle>
            <DialogDescription>
              {mode === 'replace'
                ? 'Pick a template to replace the current dashboard\'s widgets.'
                : 'Pick a pre-configured layout to get started quickly. You can customize it later.'}
            </DialogDescription>
          </DialogHeader>

          <div className="relative px-6">
            <Button
              variant="outline"
              size="icon"
              className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-background"
              onClick={() => scroll('left')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto scrollbar-hide py-1 snap-x snap-mandatory"
            >
              {DASHBOARD_TEMPLATES.map(template => {
                const Icon = template.icon;
                const isSelected = selectedId === template.id;
                return (
                  <Card
                    key={template.id}
                    className={cn(
                      'cursor-pointer transition-all shrink-0 w-[220px] snap-start',
                      isSelected
                        ? 'border-primary border-2 ring-2 ring-primary/20 bg-primary/5 shadow-[0_0_12px_hsl(var(--primary)/0.15)]'
                        : 'border-border/50 hover:border-border hover:bg-muted/30'
                    )}
                    onClick={() => setSelectedId(template.id)}
                  >
                    <CardContent className="p-3.5 flex flex-col gap-2.5 h-full">
                      <div className="flex items-center justify-between">
                        <div className={cn(
                          'p-2 rounded-lg shrink-0 transition-colors',
                          isSelected ? 'bg-primary/10' : 'bg-muted'
                        )}>
                          <Icon className={cn(
                            'h-4 w-4',
                            isSelected ? 'text-primary' : 'text-foreground'
                          )} />
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <p className="text-sm font-medium text-foreground">{template.name}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{template.description}</p>
                      <div className="flex flex-wrap gap-1 mt-auto pt-1">
                        {template.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {template.widgets.length} widgets
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="absolute -right-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-background"
              onClick={() => scroll('right')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="liquid-glass" size="sm" className="gap-2" disabled={!selectedId} onClick={handleApply}>
              Use Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for replacing current dashboard */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current dashboard's widgets with the selected template. Your existing widget layout will be lost. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReplace}>Replace Widgets</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { DASHBOARD_TEMPLATES };

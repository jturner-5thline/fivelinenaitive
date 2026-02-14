import { useState, useRef } from 'react';
import { Briefcase, ListTodo, Bell, Calendar, Mail, Sparkles, Activity, Newspaper, Zap, Bot, LayoutTemplate, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
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
    id: 'deal-manager',
    name: 'Deal Manager',
    description: 'Focus on active deals, tasks, and alerts. Ideal for deal managers tracking their pipeline day-to-day.',
    icon: Briefcase,
    tags: ['Deals', 'Tasks', 'Alerts'],
    widgets: [
      { id: 'my-deals', type: 'my-deals', title: 'My Deals', config: { maxItems: 10, variant: 'expanded' } },
      { id: 'my-tasks', type: 'my-tasks', title: 'My Tasks', config: { variant: 'expanded' } },
      { id: 'key-alerts', type: 'key-alerts', title: 'Key Alerts', config: {} },
      { id: 'my-day', type: 'my-day', title: 'My Day', config: {} },
      { id: 'email-intelligence', type: 'email-intelligence', title: 'Email Intelligence', config: {} },
    ],
    grid: [
      { i: 'my-deals', x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
      { i: 'my-tasks', x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
      { i: 'key-alerts', x: 0, y: 6, w: 4, h: 4, minW: 3, minH: 2 },
      { i: 'my-day', x: 4, y: 6, w: 4, h: 4, minW: 3, minH: 3 },
      { i: 'email-intelligence', x: 8, y: 6, w: 4, h: 4, minW: 3, minH: 2 },
    ],
  },
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
      { id: 'key-alerts', type: 'key-alerts', title: 'Key Alerts', config: {} },
    ],
    grid: [
      { i: 'workflow-suggestions', x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: 'agent-suggestions', x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
      { i: 'email-intelligence', x: 0, y: 4, w: 4, h: 4, minW: 3, minH: 2 },
      { i: 'my-deals', x: 4, y: 4, w: 4, h: 5, minW: 3, minH: 3 },
      { i: 'key-alerts', x: 8, y: 4, w: 4, h: 4, minW: 3, minH: 2 },
    ],
  },
  {
    id: 'daily-ops',
    name: 'Daily Operations',
    description: 'Calendar-centric layout with tasks and alerts. Perfect for staying on top of daily priorities.',
    icon: Calendar,
    tags: ['Calendar', 'Tasks', 'Daily'],
    widgets: [
      { id: 'my-day', type: 'my-day', title: 'My Day', config: {} },
      { id: 'my-tasks', type: 'my-tasks', title: 'My Tasks', config: { variant: 'expanded' } },
      { id: 'key-alerts', type: 'key-alerts', title: 'Key Alerts', config: {} },
      { id: 'email-intelligence', type: 'email-intelligence', title: 'Email Intelligence', config: {} },
    ],
    grid: [
      { i: 'my-day', x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
      { i: 'my-tasks', x: 6, y: 0, w: 6, h: 6, minW: 3, minH: 3 },
      { i: 'key-alerts', x: 0, y: 6, w: 6, h: 4, minW: 3, minH: 2 },
      { i: 'email-intelligence', x: 6, y: 6, w: 6, h: 4, minW: 3, minH: 2 },
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
  onSelectTemplate: (name: string, grid: GridItem[], widgets: WidgetConfig[]) => void;
  trigger?: React.ReactNode;
}

export function DashboardTemplatesDialog({ onSelectTemplate, trigger }: DashboardTemplatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleApply = () => {
    const template = DASHBOARD_TEMPLATES.find(t => t.id === selectedId);
    if (!template) return;
    onSelectTemplate(template.name, template.grid, template.widgets);
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
            Pick a pre-configured layout to get started quickly. You can customize it later.
          </DialogDescription>
        </DialogHeader>

        <div className="relative px-6">
          {/* Left arrow */}
          <Button
            variant="outline"
            size="icon"
            className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full shadow-md bg-background"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Carousel */}
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
                    'cursor-pointer transition-all border-border/50 shrink-0 w-[220px] snap-start',
                    isSelected
                      ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                      : 'hover:border-border hover:bg-muted/30'
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

          {/* Right arrow */}
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
          <Button size="sm" disabled={!selectedId} onClick={handleApply}>
            Use Template
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!selectedId} onClick={handleApply}>
            Use Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DASHBOARD_TEMPLATES };

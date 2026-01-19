import React from 'react';
import {
  Calendar,
  Mail,
  Zap,
  Briefcase,
  Bell,
  CalendarDays,
  Newspaper,
  Activity,
  Settings,
  RotateCcw,
  GripVertical,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useDashboardWidgets, DashboardWidgetConfig } from '@/contexts/DashboardWidgetsContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Calendar,
  Mail,
  Zap,
  Briefcase,
  Bell,
  CalendarDays,
  Newspaper,
  Activity,
};

interface SortableWidgetItemProps {
  widget: DashboardWidgetConfig;
  onToggle: () => void;
}

function SortableWidgetItem({ widget, onToggle }: SortableWidgetItemProps) {
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
  };

  const IconComponent = ICON_MAP[widget.icon] || Activity;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'opacity-50' : ''}`}
    >
      <Card className="border-border/50">
        <CardContent className="p-3 flex items-center gap-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="p-2 rounded-lg bg-muted shrink-0">
            <IconComponent className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">{widget.label}</p>
            <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
          </div>
          <Switch
            checked={widget.enabled}
            onCheckedChange={onToggle}
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface DashboardWidgetSettingsProps {
  trigger?: React.ReactNode;
}

export function DashboardWidgetSettings({ trigger }: DashboardWidgetSettingsProps) {
  const { widgets, toggleWidget, reorderWidgets, resetToDefaults } = useDashboardWidgets();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      reorderWidgets(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  const quickActionWidgets = widgets.filter(w => 
    ['calendar', 'email', 'quick-prompts', 'create-deal'].includes(w.id)
  );
  const mainWidgets = widgets.filter(w => 
    ['notifications', 'deals-calendar', 'news-feed', 'recent-activity'].includes(w.id)
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Customize Dashboard</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {/* Quick Action Widgets */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h4>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={quickActionWidgets.map(w => w.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {quickActionWidgets.map(widget => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={widget}
                      onToggle={() => toggleWidget(widget.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <Separator />

          {/* Main Widgets */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Main Widgets</h4>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={mainWidgets.map(w => w.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {mainWidgets.map(widget => (
                    <SortableWidgetItem
                      key={widget.id}
                      widget={widget}
                      onToggle={() => toggleWidget(widget.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

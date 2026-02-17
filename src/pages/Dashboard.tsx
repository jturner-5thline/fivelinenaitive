import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Settings2, Pencil, Check, Calendar as CalendarIcon, Mail, Zap, Briefcase, LayoutTemplate } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DealEmailsTab } from '@/components/deal/DealEmailsTab';
import { useProfile } from '@/hooks/useProfile';
import { useDashboardPresets, WidgetConfig, GridItem } from '@/hooks/useDashboardPresets';
import { WIDGET_REGISTRY } from '@/components/dashboard/widgetRegistry';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { PresetManager } from '@/components/dashboard/PresetManager';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { AddWidgetDialog } from '@/components/dashboard/AddWidgetDialog';
import { DashboardAIInput } from '@/components/dashboard/DashboardAIInput';
import { QuickPromptsDialog } from '@/components/dashboard/QuickPromptsDialog';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DashboardTemplatesDialog } from '@/components/dashboard/DashboardTemplates';
import { FullCalendarView } from '@/components/dashboard/FullCalendarView';

export default function Dashboard() {
  const { profile } = useProfile();
  const {
    presets,
    activePreset,
    isLoading,
    isSaving,
    createPreset,
    updatePreset,
    switchPreset,
    deletePreset,
    duplicatePreset,
    addWidgetToPreset,
    removeWidgetFromPreset,
  } = useDashboardPresets();

  const [isEditing, setIsEditing] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const firstName = profile?.first_name || profile?.display_name?.split(' ')[0] || 'there';

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleLayoutChange = useCallback((newLayout: GridItem[]) => {
    if (!activePreset) return;
    updatePreset(activePreset.id, { grid_config: newLayout });
  }, [activePreset, updatePreset]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    removeWidgetFromPreset(widgetId);
  }, [removeWidgetFromPreset]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (!activePreset) return;
    const sorted = [...activePreset.grid_config].sort((a, b) => (a.y * 12 + a.x) - (b.y * 12 + b.x));
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    // Reassign positions
    const updated = sorted.map((item, idx) => ({
      ...item,
      x: (idx % 2) * 6,
      y: Math.floor(idx / 2) * 4,
    }));
    updatePreset(activePreset.id, { grid_config: updated });
  }, [activePreset, updatePreset]);

  const handleAddBuiltIn = useCallback((widgetType: string) => {
    const def = WIDGET_REGISTRY[widgetType];
    if (!def) return;
    const widget: WidgetConfig = {
      id: widgetType,
      type: widgetType,
      title: def.label,
      config: {},
    };
    addWidgetToPreset(widget);
  }, [addWidgetToPreset]);

  const handleAddCustom = useCallback((widget: WidgetConfig) => {
    addWidgetToPreset(widget);
  }, [addWidgetToPreset]);

  const handleCreatePreset = useCallback((name: string) => {
    createPreset(name, [], [], true);
  }, [createPreset]);

  const handleCreateFromTemplate = useCallback((name: string, grid: GridItem[], widgets: WidgetConfig[]) => {
    createPreset(name, grid, widgets, true);
  }, [createPreset]);

  const handleRenamePreset = useCallback((presetId: string, name: string) => {
    updatePreset(presetId, { name });
  }, [updatePreset]);

  if (isLoading) {
    return (
      <div className="px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - naitive</title>
        <meta name="description" content="Your personal dashboard for managing deals and workflows." />
      </Helmet>

      <div className="bg-transparent flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-6xl space-y-6">
          {/* Hero: Greeting + AI Input + Quick Actions */}
          <div className="text-center space-y-2 pt-2">
            <p className="text-lg text-muted-foreground">{getTimeBasedGreeting()}, {firstName}</p>
            <h1 className="text-4xl md:text-5xl font-serif text-foreground">What can I do for you?</h1>
          </div>

          <DashboardAIInput />

          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setCalendarOpen(true)}>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Calendar</span>
              </div>
            </Card>
            <FullCalendarView open={calendarOpen} onOpenChange={setCalendarOpen} />
            <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setEmailOpen(true)}>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="h-12 w-12 rounded-xl bg-accent/50 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Email</span>
              </div>
            </Card>
            <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
              <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
                <DealEmailsTab dealId="" />
              </DialogContent>
            </Dialog>
            <QuickPromptsDialog
              trigger={
                <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-success/20 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-success" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Quick Prompts</span>
                  </div>
                </Card>
              }
            />
            <CreateDealDialog
              trigger={
                <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                      <Briefcase className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <span className="text-sm font-medium text-foreground">Create New Deal</span>
                  </div>
                </Card>
              }
            />
          </div>

          {/* Header row: Edit button */}
          <div className="flex items-center justify-between">
            <div />
            <div className="flex items-center gap-2">
              {isSaving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {isEditing ? 'Done' : 'Edit'}
              </Button>
            </div>
          </div>

          {/* Preset tabs + Add Widget */}
          <div className="flex items-center justify-between gap-4">
            <PresetManager
              presets={presets}
              activePreset={activePreset}
              onSwitch={switchPreset}
              onCreate={handleCreatePreset}
              onDuplicate={duplicatePreset}
              onDelete={deletePreset}
              onRename={handleRenamePreset}
            />
            <div className="flex items-center gap-2 shrink-0">
              <DashboardTemplatesDialog onSelectTemplate={handleCreateFromTemplate} />
              {isEditing && activePreset && (
                <AddWidgetDialog
                  existingWidgetIds={activePreset.widgets_config.map(w => w.id)}
                  onAddBuiltIn={handleAddBuiltIn}
                  onAddCustom={handleAddCustom}
                />
              )}
            </div>
          </div>

          {/* Grid */}
          {activePreset && (
            <DashboardGrid
              gridConfig={activePreset.grid_config}
              widgetsConfig={activePreset.widgets_config}
              isEditing={isEditing}
              onLayoutChange={handleLayoutChange}
              onRemoveWidget={handleRemoveWidget}
              onReorder={handleReorder}
            />
          )}

          {/* Empty state */}
          {activePreset && activePreset.widgets_config.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Settings2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No widgets yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start with a template or click "Edit" to add widgets manually.
              </p>
              <div className="flex items-center gap-2">
                <DashboardTemplatesDialog
                  onSelectTemplate={handleCreateFromTemplate}
                  trigger={
                    <Button variant="default" size="sm">
                      <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
                      Browse Templates
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Start Editing
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

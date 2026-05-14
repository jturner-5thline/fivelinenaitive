import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { WIDGET_REGISTRY, getWidgetsByCategory, WidgetDefinition } from './widgetRegistry';
import { WidgetConfig } from '@/hooks/useDashboardPresets';
import { cn } from '@/lib/utils';

interface AddWidgetDialogProps {
  existingWidgetIds: string[];
  onAddBuiltIn: (widgetType: string) => void;
  onAddCustom: (widget: WidgetConfig) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  intelligence: 'Intelligence',
  activity: 'Activity',
  custom: 'Custom',
};

export function AddWidgetDialog({ existingWidgetIds, onAddBuiltIn, onAddCustom }: AddWidgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('built-in');

  // Custom widget state
  const [customTitle, setCustomTitle] = useState('');
  const [customSource, setCustomSource] = useState<'deals' | 'tasks'>('deals');
  const [customManagerOnly, setCustomManagerOnly] = useState(true);
  const [customStatus, setCustomStatus] = useState<string[]>([]);
  const [customOverdueOnly, setCustomOverdueOnly] = useState(false);
  const [customDueWithin, setCustomDueWithin] = useState<number | null>(null);
  const [customMaxItems, setCustomMaxItems] = useState(10);
  // Fix #12: Validation state
  const [showNameError, setShowNameError] = useState(false);

  const categories = getWidgetsByCategory();

  const filteredWidgets = Object.values(WIDGET_REGISTRY).filter(w => {
    if (search && !w.label.toLowerCase().includes(search.toLowerCase()) && !w.description.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return w.type !== 'custom-filter';
  });

  const handleAddBuiltIn = (def: WidgetDefinition) => {
    onAddBuiltIn(def.type);
    setOpen(false);
  };

  const handleAddCustom = () => {
    // Fix #12: Show validation error
    if (!customTitle.trim()) {
      setShowNameError(true);
      return;
    }
    const id = `custom-${Date.now()}`;
    const widget: WidgetConfig = {
      id,
      type: 'custom-filter',
      title: customTitle,
      config: {
        dataSource: customSource,
        title: customTitle,
        filters: {
          managerOnly: customManagerOnly,
          status: customStatus.length > 0 ? customStatus : undefined,
          overdueOnly: customOverdueOnly,
          dueWithin: customDueWithin || undefined,
        },
        maxItems: customMaxItems,
      },
    };
    onAddCustom(widget);
    resetCustomForm();
    setOpen(false);
  };

  const resetCustomForm = () => {
    setCustomTitle('');
    setCustomSource('deals');
    setCustomManagerOnly(true);
    setCustomStatus([]);
    setCustomOverdueOnly(false);
    setCustomDueWithin(null);
    setCustomMaxItems(10);
    setShowNameError(false);
  };

  // Fix #10: Reset modal state on open
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Reset to defaults on every open
      setTab('built-in');
      setSearch('');
      resetCustomForm();
    }
  };

  const isAlreadyAdded = (type: string) => existingWidgetIds.includes(type);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0 rounded-sm">
            <TabsTrigger value="built-in">Built-in Widgets</TabsTrigger>
            <TabsTrigger value="custom">Create Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="built-in" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search widgets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {Object.entries(categories).map(([cat, widgets]) => {
              const filtered = widgets.filter(w =>
                w.type !== 'custom-filter' &&
                (!search || w.label.toLowerCase().includes(search.toLowerCase()) || w.description.toLowerCase().includes(search.toLowerCase()))
              );
              if (filtered.length === 0) return null;

              return (
                <div key={cat}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">{CATEGORY_LABELS[cat]}</h4>
                  <div className="space-y-2">
                    {filtered.map(def => {
                      const Icon = def.icon;
                      const added = isAlreadyAdded(def.type);
                      return (
                        <Card key={def.type} className={`border-border/50 ${added ? 'opacity-50' : ''}`}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-muted shrink-0">
                              <Icon className="h-4 w-4 text-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{def.label}</p>
                              <p className="text-xs text-muted-foreground">{def.description}</p>
                            </div>
                            <Button
                              variant={added ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              disabled={added}
                              onClick={() => handleAddBuiltIn(def)}
                            >
                              {added ? 'Added' : 'Add'}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="custom" className="flex-1 overflow-y-auto space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Widget Name</Label>
                <Input
                  value={customTitle}
                  onChange={(e) => { setCustomTitle(e.target.value); if (e.target.value.trim()) setShowNameError(false); }}
                  placeholder="e.g., Deals At Risk, Overdue Tasks..."
                  className={cn("mt-1", showNameError && "border-destructive ring-1 ring-destructive")}
                />
                {/* Fix #12: Inline validation error */}
                {showNameError && (
                  <p className="text-xs text-destructive mt-1">Widget name is required</p>
                )}
              </div>

              <div>
                <Label className="text-xs">Data Source</Label>
                <Select value={customSource} onValueChange={(v) => setCustomSource(v as 'deals' | 'tasks')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deals">Deals</SelectItem>
                    <SelectItem value="tasks">Tasks / Milestones</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <Label className="text-xs">Only my deals/tasks</Label>
                <Switch checked={customManagerOnly} onCheckedChange={setCustomManagerOnly} />
              </div>

              {customSource === 'deals' && (
                <div>
                  <Label className="text-xs">Filter by Status</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {['on-track', 'at-risk', 'off-track', 'on-hold'].map(s => (
                      <Badge
                        key={s}
                        variant={customStatus.includes(s) ? "default" : "outline"}
                        className="text-xs cursor-pointer"
                        onClick={() => setCustomStatus(prev =>
                          prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                        )}
                      >
                        {s.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {customSource === 'tasks' && (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Overdue only</Label>
                    <Switch checked={customOverdueOnly} onCheckedChange={setCustomOverdueOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Due within (days)</Label>
                    <Select
                      value={customDueWithin?.toString() || 'any'}
                      onValueChange={(v) => setCustomDueWithin(v === 'any' ? null : parseInt(v))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any time</SelectItem>
                        <SelectItem value="1">Today</SelectItem>
                        <SelectItem value="3">Next 3 days</SelectItem>
                        <SelectItem value="7">Next 7 days</SelectItem>
                        <SelectItem value="14">Next 14 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label className="text-xs">Max items to show</Label>
                <Select value={customMaxItems.toString()} onValueChange={(v) => setCustomMaxItems(parseInt(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleAddCustom}
                variant="liquid-glass"
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Widget
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { Focus, ListTodo, Kanban, Settings, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useDashboardLayout, DashboardLayoutMode, DashboardLayoutToggles } from '@/contexts/DashboardLayoutContext';

const LAYOUT_OPTIONS: { value: DashboardLayoutMode; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'focus', label: 'Focus', description: 'AI input hero, deals + calendar side-by-side', icon: <Focus className="h-4 w-4" /> },
  { value: 'task-ops', label: 'Task Ops', description: 'Tasks hero, deals + alerts in columns', icon: <ListTodo className="h-4 w-4" /> },
  { value: 'pipeline', label: 'Pipeline', description: 'Full-width deals table with inline details', icon: <Kanban className="h-4 w-4" /> },
];

const TOGGLE_LABELS: Record<keyof DashboardLayoutToggles, string> = {
  showMyDealsFirst: 'Show My Deals first',
  collapseCalendarByDefault: 'Collapse calendar by default',
  hideEmailHints: 'Hide email intelligence',
  onlyUrgentAlerts: 'Only show urgent alerts',
  showStatusNotes: 'Show status notes on deals',
  showTaskCounts: 'Show task counts',
  compactMode: 'Compact mode',
};

export function DashboardLayoutSwitcher() {
  const { layoutMode, setLayoutMode, toggles, setToggle, resetToggles } = useDashboardLayout();

  return (
    <div className="flex items-center gap-2">
      <ToggleGroup type="single" value={layoutMode} onValueChange={(v) => v && setLayoutMode(v as DashboardLayoutMode)} className="bg-muted/50 rounded-lg p-0.5">
        {LAYOUT_OPTIONS.map(opt => (
          <ToggleGroupItem key={opt.value} value={opt.value} className="gap-1.5 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm px-3">
            {opt.icon}
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Dashboard Settings</h4>
            <Button variant="ghost" size="sm" onClick={resetToggles} className="h-7 text-xs gap-1">
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
          <Separator className="mb-3" />
          <div className="space-y-3">
            {(Object.keys(TOGGLE_LABELS) as (keyof DashboardLayoutToggles)[]).map(key => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key} className="text-xs text-muted-foreground cursor-pointer">{TOGGLE_LABELS[key]}</Label>
                <Switch id={key} checked={toggles[key]} onCheckedChange={(v) => setToggle(key, v)} />
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

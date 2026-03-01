import { useState, useEffect, useCallback } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  BarChart3, FileSpreadsheet, Database, Sparkles, Zap,
  Upload, Flag, MessageSquare, CheckCircle2, TrendingUp,
  Download, Search, Table2, Calculator, Settings, Play
} from 'lucide-react';

interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: string;
  action: () => void;
}

interface FPACommandPaletteProps {
  onNavigateToTab: (tab: string) => void;
  onAction?: (actionId: string) => void;
}

export function FPACommandPalette({ onNavigateToTab, onAction }: FPACommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const runAction = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const actions: CommandAction[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboards', description: 'Overview, P&L, Balance Sheet', icon: <BarChart3 className="h-4 w-4" />, group: 'Navigate', action: () => onNavigateToTab('dashboards') },
    { id: 'nav-sheets', label: 'Go to Sheets', description: 'Spreadsheet workbook engine', icon: <FileSpreadsheet className="h-4 w-4" />, group: 'Navigate', action: () => onNavigateToTab('sheets') },
    { id: 'nav-data', label: 'Go to Data', description: 'Data sources and imports', icon: <Database className="h-4 w-4" />, group: 'Navigate', action: () => onNavigateToTab('data') },
    { id: 'nav-ai', label: 'Go to AI', description: 'AI intelligence and analysis', icon: <Sparkles className="h-4 w-4" />, group: 'Navigate', action: () => onNavigateToTab('ai') },
    { id: 'nav-automations', label: 'Go to Automations', description: 'Workflows and triggers', icon: <Zap className="h-4 w-4" />, group: 'Navigate', action: () => onNavigateToTab('automations') },

    // Actions
    { id: 'upload-workbook', label: 'Upload Excel Workbook', description: 'Import .xlsx, .xls, or .csv', icon: <Upload className="h-4 w-4" />, group: 'Actions', action: () => { onNavigateToTab('sheets'); onAction?.('upload-workbook'); } },
    { id: 'run-scenario', label: 'Run Scenario Analysis', description: 'Base, Bull, Bear comparison', icon: <Play className="h-4 w-4" />, group: 'Actions', action: () => { onNavigateToTab('dashboards'); onAction?.('run-scenario'); } },
    { id: 'flag-variance', label: 'Flag a Variance', description: 'Flag a line item for review', icon: <Flag className="h-4 w-4" />, group: 'Actions', action: () => { onNavigateToTab('dashboards'); onAction?.('flag-variance'); } },
    { id: 'export-pdf', label: 'Export Dashboard as PDF', description: 'Download current view', icon: <Download className="h-4 w-4" />, group: 'Actions', action: () => onAction?.('export-pdf') },

    // Analysis
    { id: 'view-pnl', label: 'View P&L Statement', description: 'Income statement with variances', icon: <Table2 className="h-4 w-4" />, group: 'Analysis', action: () => { onNavigateToTab('dashboards'); onAction?.('view-pnl'); } },
    { id: 'view-scenarios', label: 'View Scenarios', description: 'Stress tests and sensitivity', icon: <TrendingUp className="h-4 w-4" />, group: 'Analysis', action: () => { onNavigateToTab('dashboards'); onAction?.('view-scenarios'); } },
    { id: 'budget-approvals', label: 'Budget Approvals', description: 'Review pending budget changes', icon: <CheckCircle2 className="h-4 w-4" />, group: 'Analysis', action: () => { onNavigateToTab('dashboards'); onAction?.('budget-approvals'); } },
    { id: 'variance-reviews', label: 'Variance Reviews', description: 'Review flagged variances', icon: <MessageSquare className="h-4 w-4" />, group: 'Analysis', action: () => { onNavigateToTab('dashboards'); onAction?.('variance-reviews'); } },
  ];

  const groups = [...new Set(actions.map(a => a.group))];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search FP&A actions... (⌘K)" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {actions.filter(a => a.group === group).map(action => (
                <CommandItem
                  key={action.id}
                  onSelect={() => runAction(action.action)}
                  className="gap-3"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted">
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

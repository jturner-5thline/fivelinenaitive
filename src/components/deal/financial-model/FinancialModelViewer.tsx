import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useFinancialModel } from '@/hooks/useFinancialModel';
import { AssumptionsSheet } from './AssumptionsSheet';
import { RevenueBuildSheet } from './RevenueBuildSheet';
import { OperatingExpensesSheet } from './OperatingExpensesSheet';
import { FinancialStatementsSheet } from './FinancialStatementsSheet';
import { DashboardSheet } from './DashboardSheet';
import { cn } from '@/lib/utils';
import { 
  Settings, TrendingUp, DollarSign, FileText, BarChart3,
  Undo2, Redo2, RotateCcw, Download
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FinancialModelViewerProps {
  dealId: string;
}

type SheetTab = 'assumptions' | 'revenue' | 'expenses' | 'statements' | 'dashboard';

const tabs: { id: SheetTab; label: string; icon: React.ElementType }[] = [
  { id: 'assumptions', label: 'Assumptions', icon: Settings },
  { id: 'revenue', label: 'Revenue Build', icon: TrendingUp },
  { id: 'expenses', label: 'Operating Expenses', icon: DollarSign },
  { id: 'statements', label: 'Financial Statements', icon: FileText },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
];

export function FinancialModelViewer({ dealId }: FinancialModelViewerProps) {
  const [activeTab, setActiveTab] = useState<SheetTab>('assumptions');
  const {
    assumptions,
    updateAssumption,
    monthlyData,
    annualData,
    dashboardMetrics,
    undo,
    redo,
    canUndo,
    canRedo,
    resetToDefaults,
  } = useFinancialModel(dealId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleExport = useCallback(() => {
    // Export to JSON for now
    const exportData = {
      assumptions,
      monthlyData,
      annualData,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-model-${dealId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [assumptions, monthlyData, annualData, dealId]);

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undo}
                  disabled={!canUndo}
                  className="h-8 w-8 p-0"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={redo}
                  disabled={!canRedo}
                  className="h-8 w-8 p-0"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="w-px h-6 bg-border mx-2" />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  className="h-8 w-8 p-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to Defaults</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-sm font-medium text-muted-foreground">
          {assumptions.companyName} - Financial Model
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'assumptions' && (
          <AssumptionsSheet assumptions={assumptions} onUpdate={updateAssumption} />
        )}
        {activeTab === 'revenue' && (
          <RevenueBuildSheet monthlyData={monthlyData} />
        )}
        {activeTab === 'expenses' && (
          <OperatingExpensesSheet monthlyData={monthlyData} />
        )}
        {activeTab === 'statements' && (
          <FinancialStatementsSheet annualData={annualData} />
        )}
        {activeTab === 'dashboard' && (
          <DashboardSheet 
            monthlyData={monthlyData} 
            annualData={annualData} 
            metrics={dashboardMetrics} 
          />
        )}
      </div>

      {/* Excel-style Sheet Tabs */}
      <div className="flex items-center border-t bg-slate-100 dark:bg-slate-800 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-r transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-background text-foreground border-t-2 border-t-primary -mt-px'
                  : 'text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

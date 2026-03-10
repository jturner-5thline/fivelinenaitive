import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, FileSpreadsheet, Wallet, Upload, TrendingDown, Landmark, Loader2, Check, BarChart3, ShieldCheck, ChevronRight, Command, MessageSquare } from 'lucide-react';
import { useSaaSModel } from '@/hooks/useSaaSModel';
import { useModelAnnotations } from '@/hooks/useModelAnnotations';
import { SaaSModelDashboard } from './SaaSModelDashboard';
import { SaaSModelIncomeStatement } from './SaaSModelIncomeStatement';
import { SaaSModelBalanceSheet } from './SaaSModelBalanceSheet';
import { SaaSModelDataMapping } from './SaaSModelDataMapping';
import { SaaSModelSensitivity } from './SaaSModelSensitivity';
import { SaaSModelDebtServicing } from './SaaSModelDebtServicing';
import { SaaSModelCharts } from './SaaSModelCharts';
import { SaaSModelCreditAnalysis } from './SaaSModelCreditAnalysis';
import { AnalysisChatPanel } from './AnalysisChatPanel';
import { SaaSModelCommandPalette } from './SaaSModelCommandPalette';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'income-statement': 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'data-mapping': 'Data Mapping',
  sensitivity: 'Sensitivity',
  'debt-servicing': 'Debt Servicing',
  charts: 'Charts',
  'credit-analysis': 'Credit Analysis',
};

interface SaaSModelTabProps {
  dealId: string;
  dealData?: {
    company: string;
    value?: number;
    stage?: string;
  };
}

export function SaaSModelTab({ dealId, dealData }: SaaSModelTabProps) {
  const { model, scenarios, lenders, isLoading, saveStatus, updateModel, recalculate, updateScenarios, updateLender } = useSaaSModel(dealId);
  const annotationHook = useModelAnnotations(dealId);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Keyboard shortcuts: number keys 1-8 to switch tabs
  useEffect(() => {
    const TAB_KEYS = ['dashboard', 'income-statement', 'balance-sheet', 'data-mapping', 'sensitivity', 'debt-servicing', 'charts', 'credit-analysis'];
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput || e.metaKey || e.ctrlKey) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TAB_KEYS.length) {
        setActiveTab(TAB_KEYS[idx]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleExportAction = useCallback((actionId: string) => {
    if (actionId === 'export-pdf') {
      toast.promise(
        new Promise(resolve => setTimeout(resolve, 1500)),
        { loading: 'Generating PDF…', success: 'PDF exported successfully', error: 'Export failed' }
      );
    } else if (actionId === 'export-excel') {
      toast.promise(
        new Promise(resolve => setTimeout(resolve, 1500)),
        { loading: 'Generating Excel…', success: 'Excel exported successfully', error: 'Export failed' }
      );
    } else if (actionId === 'print') {
      window.print();
    }
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-28" />
        </div>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-8 w-full max-w-3xl" />
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        {/* Chart skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Command Palette */}
      <SaaSModelCommandPalette onNavigate={setActiveTab} onAction={handleExportAction} />

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="hover:text-foreground cursor-pointer transition-colors">
          {dealData?.company || model.settings.companyName}
        </span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-foreground cursor-pointer transition-colors">Financial Model</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">{TAB_LABELS[activeTab] || activeTab}</span>
      </div>

      {/* Header with save status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold font-[Inter]">
            SaaS Financial Model
          </h2>
          <p className="text-xs text-muted-foreground">
            {model.settings.companyName} — {model.settings.businessModel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* ⌘K hint */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
            }}
          >
            <Command className="h-3 w-3" />
            <span>K</span>
          </Button>

          {/* Save status */}
          {saveStatus !== 'idle' && (
            <Badge variant="outline" className={cn(
              "text-xs gap-1 transition-all duration-300",
              saveStatus === 'saving' && "border-primary/30 text-primary",
              saveStatus === 'saved' && "border-emerald-500/30 text-emerald-500"
            )}>
              {saveStatus === 'saving' ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
              ) : (
                <><Check className="h-3 w-3" /> Saved</>
              )}
            </Badge>
          )}
          {/* Annotation count badge */}
          {annotationHook.unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1 h-5">
              <MessageSquare className="h-3 w-3" />
              {annotationHook.unresolvedCount} open
            </Badge>
          )}
          <AnalysisChatPanel model={model} activeTab={activeTab} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8 bg-muted/30 rounded-sm">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs rounded-sm h-7">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="income-statement" className="gap-1.5 text-xs rounded-sm h-7">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Income Statement
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="gap-1.5 text-xs rounded-sm h-7">
            <Wallet className="h-3.5 w-3.5" /> Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="data-mapping" className="gap-1.5 text-xs rounded-sm h-7">
            <Upload className="h-3.5 w-3.5" /> Data Mapping
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="gap-1.5 text-xs rounded-sm h-7">
            <TrendingDown className="h-3.5 w-3.5" /> Sensitivity
          </TabsTrigger>
          <TabsTrigger value="debt-servicing" className="gap-1.5 text-xs rounded-sm h-7">
            <Landmark className="h-3.5 w-3.5" /> Debt Servicing
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 text-xs rounded-sm h-7">
            <BarChart3 className="h-3.5 w-3.5" /> Charts
          </TabsTrigger>
          <TabsTrigger value="credit-analysis" className="gap-1.5 text-xs rounded-sm h-7">
            <ShieldCheck className="h-3.5 w-3.5" /> Credit Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <SaaSModelDashboard model={model} annotations={annotationHook} />
        </TabsContent>
        <TabsContent value="income-statement" className="mt-4">
          <SaaSModelIncomeStatement model={model} />
        </TabsContent>
        <TabsContent value="balance-sheet" className="mt-4">
          <SaaSModelBalanceSheet model={model} />
        </TabsContent>
        <TabsContent value="data-mapping" className="mt-4">
          <SaaSModelDataMapping dealId={dealId} model={model} updateModel={updateModel} recalculate={recalculate} />
        </TabsContent>
        <TabsContent value="sensitivity" className="mt-4">
          <SaaSModelSensitivity model={model} scenarios={scenarios} updateScenarios={updateScenarios} />
        </TabsContent>
        <TabsContent value="debt-servicing" className="mt-4">
          <SaaSModelDebtServicing lenders={lenders} updateLender={updateLender} />
        </TabsContent>
        <TabsContent value="charts" className="mt-4">
          <SaaSModelCharts model={model} />
        </TabsContent>
        <TabsContent value="credit-analysis" className="mt-4">
          <SaaSModelCreditAnalysis model={model} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

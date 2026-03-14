import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { LayoutDashboard, FileSpreadsheet, Wallet, Upload, TrendingDown, Landmark, Loader2, Check, BarChart3, ShieldCheck, ChevronRight, Command, MessageSquare, History, Dice5, FileText } from 'lucide-react';
import { useSaaSModel } from '@/hooks/useSaaSModel';
import { useModelAnnotations } from '@/hooks/useModelAnnotations';
import { SaaSModelDashboard } from './SaaSModelDashboard';
import { SaaSModelIncomeStatement } from './SaaSModelIncomeStatement';
import { SaaSModelBalanceSheet } from './SaaSModelBalanceSheet';
import { SaaSModelDataMapping, type DataMappingHandle } from './SaaSModelDataMapping';
import { SaaSModelSensitivity } from './SaaSModelSensitivity';
import { SaaSModelDebtServicing } from './SaaSModelDebtServicing';
import { SaaSModelCharts } from './SaaSModelCharts';
import { SaaSModelCreditAnalysis } from './SaaSModelCreditAnalysis';

import { SaaSModelCommandPalette } from './SaaSModelCommandPalette';
import { ModelVersioning } from './ModelVersioning';
import { MonteCarloSimulation } from './MonteCarloSimulation';
import { CreditMemoExport } from './CreditMemoExport';

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
  'monte-carlo': 'Monte Carlo',
  versioning: 'Versioning',
  export: 'Export',
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

  // Navigation guard state
  const dataMappingRef = useRef<DataMappingHandle>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);

  // Keyboard shortcuts: number keys 1-8 to switch tabs
  useEffect(() => {
    const TAB_KEYS = ['dashboard', 'income-statement', 'balance-sheet', 'data-mapping', 'sensitivity', 'debt-servicing', 'charts', 'credit-analysis', 'monte-carlo', 'versioning', 'export'];
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput || e.metaKey || e.ctrlKey) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < TAB_KEYS.length) {
        handleTabChange(TAB_KEYS[idx]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab]);

  const handleTabChange = useCallback((newTab: string) => {
    // If leaving data-mapping with unsaved changes, intercept
    if (activeTab === 'data-mapping' && newTab !== 'data-mapping' && dataMappingRef.current?.hasUnsavedChanges()) {
      setPendingTab(newTab);
      setShowUnsavedDialog(true);
      return;
    }
    setActiveTab(newTab);
  }, [activeTab]);

  const handleSaveAndLeave = useCallback(async () => {
    setIsSavingBeforeLeave(true);
    try {
      await dataMappingRef.current?.saveProgress();
      setShowUnsavedDialog(false);
      if (pendingTab) setActiveTab(pendingTab);
      setPendingTab(null);
    } catch {
      toast.error('Failed to save — please try again');
    } finally {
      setIsSavingBeforeLeave(false);
    }
  }, [pendingTab]);

  const handleDiscardAndLeave = useCallback(() => {
    setShowUnsavedDialog(false);
    if (pendingTab) setActiveTab(pendingTab);
    setPendingTab(null);
  }, [pendingTab]);

  const handleCancelLeave = useCallback(() => {
    setShowUnsavedDialog(false);
    setPendingTab(null);
  }, []);

  const handleExportAction = useCallback((actionId: string) => {
    if (actionId === 'export-pdf' || actionId === 'export-excel') {
      handleTabChange('export');
    } else if (actionId === 'print') {
      window.print();
    }
  }, [handleTabChange]);

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

  const unsavedCount = dataMappingRef.current?.getUnsavedCount() ?? 0;

  return (
    <div className="space-y-4">
      {/* Command Palette */}
      <SaaSModelCommandPalette onNavigate={handleTabChange} onAction={handleExportAction} />

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
          
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-8 bg-muted/30 rounded-sm">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs rounded-sm h-7" title="Press 1">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="income-statement" className="gap-1.5 text-xs rounded-sm h-7" title="Press 2">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Income Statement
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="gap-1.5 text-xs rounded-sm h-7" title="Press 3">
            <Wallet className="h-3.5 w-3.5" /> Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="data-mapping" className="gap-1.5 text-xs rounded-sm h-7" title="Press 4">
            <Upload className="h-3.5 w-3.5" /> Data Mapping
          </TabsTrigger>
          <TabsTrigger value="sensitivity" className="gap-1.5 text-xs rounded-sm h-7" title="Press 5">
            <TrendingDown className="h-3.5 w-3.5" /> Sensitivity
          </TabsTrigger>
          <TabsTrigger value="debt-servicing" className="gap-1.5 text-xs rounded-sm h-7" title="Press 6">
            <Landmark className="h-3.5 w-3.5" /> Debt Servicing
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 text-xs rounded-sm h-7" title="Press 7">
            <BarChart3 className="h-3.5 w-3.5" /> Charts
          </TabsTrigger>
          <TabsTrigger value="credit-analysis" className="gap-1.5 text-xs rounded-sm h-7" title="Press 8">
            <ShieldCheck className="h-3.5 w-3.5" /> Credit Analysis
          </TabsTrigger>
          <TabsTrigger value="monte-carlo" className="gap-1.5 text-xs rounded-sm h-7" title="Press 9">
            <Dice5 className="h-3.5 w-3.5" /> Monte Carlo
          </TabsTrigger>
          <TabsTrigger value="versioning" className="gap-1.5 text-xs rounded-sm h-7" title="Press 0">
            <History className="h-3.5 w-3.5" /> Versioning
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5 text-xs rounded-sm h-7">
            <FileText className="h-3.5 w-3.5" /> Export
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
          <SaaSModelDataMapping ref={dataMappingRef} dealId={dealId} model={model} updateModel={updateModel} recalculate={recalculate} />
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
        <TabsContent value="monte-carlo" className="mt-4">
          <MonteCarloSimulation model={model} />
        </TabsContent>
        <TabsContent value="versioning" className="mt-4">
          <ModelVersioning
            dealId={dealId}
            model={model}
            scenarios={scenarios}
            lenders={lenders}
            onRestore={(restoredModel, restoredScenarios, restoredLenders) => {
              updateModel(() => restoredModel);
              updateScenarios(restoredScenarios);
              restoredLenders.forEach((l, i) => updateLender(i, l));
              toast.success('Model restored from snapshot');
            }}
          />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <CreditMemoExport model={model} scenarios={scenarios} lenders={lenders} />
        </TabsContent>
      </Tabs>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={(open) => { if (!open) handleCancelLeave(); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have {unsavedCount} unsaved mapping {unsavedCount === 1 ? 'change' : 'changes'}. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleCancelLeave} disabled={isSavingBeforeLeave}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleDiscardAndLeave} disabled={isSavingBeforeLeave}>
              Discard & Leave
            </Button>
            <Button onClick={handleSaveAndLeave} disabled={isSavingBeforeLeave} className="gap-1.5">
              {isSavingBeforeLeave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save & Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
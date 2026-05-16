import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { LayoutDashboard, FileSpreadsheet, Wallet, Upload, TrendingDown, Landmark, Loader2, Check, ShieldCheck, ChevronRight, MessageSquare, History, Dice5, FileText, Settings2 } from 'lucide-react';
import { useSaaSModel } from '@/hooks/useSaaSModel';
import { useModelAnnotations } from '@/hooks/useModelAnnotations';
import { SaaSModelDashboard } from './SaaSModelDashboard';
import { SaaSModelIncomeStatement } from './SaaSModelIncomeStatement';
import { SaaSModelBalanceSheet } from './SaaSModelBalanceSheet';
import { SaaSModelDataMapping, type DataMappingHandle } from './SaaSModelDataMapping';
import { SaaSModelSensitivity } from './SaaSModelSensitivity';
import { SaaSModelDebtServicing } from './SaaSModelDebtServicing';
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
import { supabase } from '@/integrations/supabase/client';

// ─── Tab definitions ────────────────────────────────────────────────
interface TabDef {
  key: string;
  label: string;
  icon: React.ElementType;
  locked?: boolean; // locked tabs can't be hidden
}

const ALL_TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: true },
  { key: 'income-statement', label: 'Income Statement', icon: FileSpreadsheet },
  { key: 'balance-sheet', label: 'Balance Sheet', icon: Wallet },
  { key: 'data-mapping', label: 'Data Mapping', icon: Upload },
  { key: 'sensitivity', label: 'Sensitivity', icon: TrendingDown },
  { key: 'debt-servicing', label: 'Debt Servicing', icon: Landmark },
  { key: 'credit-analysis', label: 'Credit Analysis', icon: ShieldCheck },
  { key: 'monte-carlo', label: 'Monte Carlo', icon: Dice5 },
  { key: 'export', label: 'Export', icon: FileText },
];

const TAB_LABELS: Record<string, string> = Object.fromEntries(ALL_TABS.map(t => [t.key, t.label]));

const ALL_TAB_KEYS = new Set(ALL_TABS.map(t => t.key));

function parseVisibleTabs(raw: unknown): Set<string> {
  if (Array.isArray(raw)) {
    const set = new Set(raw.filter((k): k is string => typeof k === 'string' && ALL_TAB_KEYS.has(k)));
    ALL_TABS.filter(t => t.locked).forEach(t => set.add(t.key));
    return set;
  }
  return new Set(ALL_TABS.map(t => t.key));
}

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
  const [versioningOpen, setVersioningOpen] = useState(false);

  // Tab visibility – global platform setting
  const [visibleTabs, setVisibleTabs] = useState<Set<string>>(() => new Set(ALL_TABS.map(t => t.key)));
  const [globalTabsLoaded, setGlobalTabsLoaded] = useState(false);

  // Load global visible tabs from platform_settings
  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'analysis_visible_tabs')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setVisibleTabs(parseVisibleTabs(data.value));
        }
        setGlobalTabsLoaded(true);
      });
  }, []);

  const toggleTab = useCallback((key: string) => {
    setVisibleTabs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (key === activeTab) setActiveTab('dashboard');
      } else {
        next.add(key);
      }
      // Persist globally
      const arr = Array.from(next);
      supabase
        .from('platform_settings')
        .upsert({ key: 'analysis_visible_tabs', value: arr as any, updated_at: new Date().toISOString(), updated_by: null }, { onConflict: 'key' })
        .then(({ error }) => {
          if (error) console.error('Failed to save visible tabs globally:', error);
        });
      return next;
    });
  }, [activeTab]);

  const visibleTabList = useMemo(
    () => ALL_TABS.filter(t => visibleTabs.has(t.key)),
    [visibleTabs]
  );

  // Navigation guard state
  const dataMappingRef = useRef<DataMappingHandle>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);

  // Keyboard shortcuts: number keys 1-9,0 to switch visible tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput || e.metaKey || e.ctrlKey) return;
      const idx = e.key === '0' ? 9 : parseInt(e.key) - 1;
      if (idx >= 0 && idx < visibleTabList.length) {
        handleTabChange(visibleTabList[idx].key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTab, visibleTabList]);

  const handleTabChange = useCallback((newTab: string) => {
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
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="h-8 w-full max-w-3xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  const unsavedCount = dataMappingRef.current?.getUnsavedCount() ?? 0;
  const hiddenCount = ALL_TABS.length - visibleTabList.length;

  return (
    <div className="space-y-4">
      {/* Command Palette */}
      <SaaSModelCommandPalette onNavigate={handleTabChange} onAction={handleExportAction} />


      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin border-b border-border/60">
            <TabsList
              className="h-9 bg-transparent p-0 gap-0 rounded-none border-0 flex-nowrap justify-start [&>span]:!bg-transparent [&>span]:!border-0 [&>span]:!shadow-none"
            >
              {visibleTabList.map((tab, idx) => {
                const Icon = tab.icon;
                const shortcutKey = idx < 9 ? String(idx + 1) : idx === 9 ? '0' : undefined;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="gap-1.5 text-xs h-9 px-3 rounded-none whitespace-nowrap shrink-0 border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent"
                    title={shortcutKey ? `Press ${shortcutKey}` : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" /> {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab visibility settings */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  title="Configure visible tabs"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium mb-2">Visible Tabs</p>
                  {ALL_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isVisible = visibleTabs.has(tab.key);
                    return (
                      <label
                        key={tab.key}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors",
                          "hover:bg-muted/50",
                          tab.locked && "opacity-60 cursor-default"
                        )}
                      >
                        <Checkbox
                          checked={isVisible}
                          onCheckedChange={() => !tab.locked && toggleTab(tab.key)}
                          disabled={tab.locked}
                          className="h-3.5 w-3.5"
                        />
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span>{tab.label}</span>
                        {tab.locked && (
                          <span className="ml-auto text-[9px] text-muted-foreground">Required</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {hiddenCount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">
                    {hiddenCount} tab{hiddenCount !== 1 ? 's' : ''} hidden
                  </p>
                )}
              </PopoverContent>
            </Popover>

            {/* Versioning button */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground px-2"
              onClick={() => setVersioningOpen(true)}
              title="Version History"
            >
              <History className="h-3 w-3" />
              <span>Versions</span>
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

        <TabsContent value="dashboard" className="mt-4">
          <SaaSModelDashboard model={model} annotations={annotationHook} dealId={dealId} />
        </TabsContent>
        <TabsContent value="income-statement" className="mt-4">
          <SaaSModelIncomeStatement model={model} dealId={dealId} />
        </TabsContent>
        <TabsContent value="balance-sheet" className="mt-4">
          <SaaSModelBalanceSheet model={model} dealId={dealId} />
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
        <TabsContent value="credit-analysis" className="mt-4">
          <SaaSModelCreditAnalysis model={model} />
        </TabsContent>
        <TabsContent value="monte-carlo" className="mt-4">
          <MonteCarloSimulation model={model} />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <CreditMemoExport model={model} scenarios={scenarios} lenders={lenders} />
        </TabsContent>
      </Tabs>

      {/* Versioning Dialog */}
      <Dialog open={versioningOpen} onOpenChange={setVersioningOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View, compare, and restore previous model snapshots.
            </DialogDescription>
          </DialogHeader>
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
              setVersioningOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

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
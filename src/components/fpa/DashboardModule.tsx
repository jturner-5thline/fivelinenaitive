import { useState, lazy, Suspense, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Settings2, Shield, Lock } from 'lucide-react';
import { ChartConfigPanel, DEFAULT_CHART_CONFIG, type ChartConfig } from './dashboard/ChartConfigPanel';
import { FPADashboardConfigPanel } from './dashboard/FPADashboardConfigPanel';
import { useFPADashboardConfig } from '@/hooks/useFPADashboardConfig';
import { useFPATabPermissions } from '@/hooks/useFPATabPermissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy-loaded tab content for code splitting
const KPICards = lazy(() => import('./dashboard/KPICards').then(m => ({ default: m.KPICards })));
const InteractivePLTable = lazy(() => import('./dashboard/InteractivePLTable').then(m => ({ default: m.InteractivePLTable })));
const RevenueOPEXCharts = lazy(() => import('./dashboard/RevenueOPEXCharts').then(m => ({ default: m.RevenueOPEXCharts })));
const BalanceCashFlow = lazy(() => import('./dashboard/BalanceCashFlow').then(m => ({ default: m.BalanceCashFlow })));
const ScenarioModeling = lazy(() => import('./dashboard/ScenarioModeling').then(m => ({ default: m.ScenarioModeling })));
const StressTesting = lazy(() => import('./dashboard/StressTesting').then(m => ({ default: m.StressTesting })));
const SensitivityTable = lazy(() => import('./dashboard/SensitivityTable').then(m => ({ default: m.SensitivityTable })));
const VarianceReviewPanel = lazy(() => import('./collaboration/VarianceReviewPanel').then(m => ({ default: m.VarianceReviewPanel })));
const BudgetApprovalWorkflow = lazy(() => import('./collaboration/BudgetApprovalWorkflow').then(m => ({ default: m.BudgetApprovalWorkflow })));
const VarianceLegend = lazy(() => import('./VarianceLegend').then(m => ({ default: m.VarianceLegend })));
const BoardReportExport = lazy(() => import('./BoardReportExport').then(m => ({ default: m.BoardReportExport })));
const BDRoiModule = lazy(() => import('./bd-roi/BDRoiModule').then(m => ({ default: m.BDRoiModule })));
const CashFlowManager = lazy(() => import('@/components/cashflow/CashFlowManager').then(m => ({ default: m.CashFlowManager })));

function TabSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-[300px] w-full" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

/**
 * Renders children into the Finance page header's right-side action slot
 * (`#finance-header-actions`). Falls back to inline rendering if the slot
 * isn't mounted (e.g. DashboardModule used outside the Finance shell).
 */
function HeaderPortal({ children, slotId }: { children: React.ReactNode; slotId: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const find = () => {
      const el = document.getElementById(slotId);
      if (el) {
        if (!cancelled) setTarget(el);
        return true;
      }
      return false;
    };
    if (find()) return;
    // Header may mount slightly after this child; poll briefly.
    const interval = window.setInterval(() => {
      if (find()) window.clearInterval(interval);
    }, 50);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [slotId]);
  if (!target) return null;
  return createPortal(<>{children}</>, target);
}

function HeaderActionsPortal({ children }: { children: React.ReactNode }) {
  return <HeaderPortal slotId="finance-header-actions">{children}</HeaderPortal>;
}
function HeaderTabsPortal({ children }: { children: React.ReactNode }) {
  return <HeaderPortal slotId="finance-header-tabs">{children}</HeaderPortal>;
}

// Smart default: pick date range based on current month
function getSmartDateRange(): string {
  const month = new Date().getMonth();
  if (month <= 2) return '3m';
  if (month <= 5) return '6m';
  return 'ytd';
}

function getSmartComparison(): 'budget' | 'prior_year' | 'prior_period' {
  const month = new Date().getMonth();
  if (month >= 9) return 'budget';
  return 'prior_year';
}

function AccessDenied() {
  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold mb-1">You don't have access to this tab</h3>
        <p className="text-sm text-muted-foreground">Contact your team admin to request access.</p>
      </CardContent>
    </Card>
  );
}

interface DashboardModuleProps {
  headerExtras?: React.ReactNode;
}

export function DashboardModule({ headerExtras }: DashboardModuleProps = {}) {
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [comparisonMode, setComparisonMode] = useState<'budget' | 'prior_year' | 'prior_period'>(getSmartComparison);
  const [dateRange, setDateRange] = useState(getSmartDateRange);
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [chartConfigOpen, setChartConfigOpen] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [teamConfigOpen, setTeamConfigOpen] = useState(false);

  const { config: fpaConfig, isAdmin, isSaving, saveConfig } = useFPADashboardConfig();
  const { canViewTab } = useFPATabPermissions();
  const t = fpaConfig.tabs;
  const c = fpaConfig.charts;
  const e = fpaConfig.elements;
  const s = fpaConfig.scenarios;

  const isTabVisible = useCallback((tabKey: string, configEnabled?: boolean) => {
    const enabled = configEnabled !== undefined ? configEnabled : true;
    return enabled && canViewTab(tabKey);
  }, [canViewTab]);

  const visibleTabKeys = useMemo(() => {
    const keys: string[] = [];
    if (isTabVisible('overview', t.overview)) keys.push('overview');
    if (isTabVisible('pnl', t.pnl)) keys.push('pnl');
    if (isTabVisible('balance', t.balance)) keys.push('balance');
    if (isTabVisible('cashflow', t.cashflow)) keys.push('cashflow');
    if (isTabVisible('scenarios', t.scenarios)) keys.push('scenarios');
    if (isTabVisible('collaborate', t.collaborate)) keys.push('collaborate');
    if (isTabVisible('export', t.export)) keys.push('export');
    if (isTabVisible('salesBdRoi')) keys.push('salesBdRoi');
    return keys;
  }, [isTabVisible, t]);

  const activeTab = visibleTabKeys.includes(dashboardTab)
    ? dashboardTab
    : (visibleTabKeys[0] || 'overview');

  const showAccessDenied = !canViewTab(activeTab);

  const handleKPIClick = useCallback((kpi: { id: string }) => {
    setSelectedKPI(prev => kpi.id === prev ? null : kpi.id);
  }, []);

  return (
    <div className="space-y-4">
      {/* Dialogs */}
      <ChartConfigPanel
        open={chartConfigOpen}
        onOpenChange={setChartConfigOpen}
        config={chartConfig}
        onConfigChange={setChartConfig}
      />
      <FPADashboardConfigPanel
        open={teamConfigOpen}
        onOpenChange={setTeamConfigOpen}
        config={fpaConfig}
        onSave={saveConfig}
        isSaving={isSaving}
      />

      {/* Top-right header actions — portaled into the Finance page header. */}
      <HeaderActionsPortal>
        {e.comparisonFilter && (
          <Select value={comparisonMode} onValueChange={(v) => setComparisonMode(v as any)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prior_year">vs Prior Year</SelectItem>
              <SelectItem value="prior_period">vs Prior Period</SelectItem>
              <SelectItem value="budget">vs Budget</SelectItem>
            </SelectContent>
          </Select>
        )}
        {e.dateRangeFilter && (
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Last 3M</SelectItem>
              <SelectItem value="6m">Last 6M</SelectItem>
              <SelectItem value="12m">Last 12M</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
        )}
        {e.chartConfigButton && (
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setChartConfigOpen(true)} aria-label="Charts" title="Charts">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {e.exportButton && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label="Export"
            title="Export"
            onClick={() => {
              // On the Cash Flow tab, this becomes the SUPERSET export (KPI
              // row + filters line + two charts + weekly cash-flow table).
              // CashFlowManager listens for this event and produces the PDF.
              if (activeTab === 'cashflow') {
                window.dispatchEvent(new CustomEvent('cashflow:superset-export'));
              }
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
        {isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTeamConfigOpen(true)} aria-label="Team Config" title="Team Config">
                <Shield className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Configure which elements are visible to your team</p>
            </TooltipContent>
          </Tooltip>
        )}
        {headerExtras}
      </HeaderActionsPortal>

      {/* Global Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={activeTab} onValueChange={setDashboardTab}>
          <HeaderTabsPortal>
            <TabsList className="h-8 bg-transparent p-0 gap-1">
              {isTabVisible('cashflow', t.cashflow) && (
                <TabsTrigger
                  value="cashflow"
                  className="h-8 px-2.5 text-xs rounded-md"
                >
                  Cash Flow
                </TabsTrigger>
              )}
              {isTabVisible('salesBdRoi') && (
                <TabsTrigger
                  value="salesBdRoi"
                  className="h-8 px-2.5 text-xs rounded-md"
                >
                  Sales & BD ROI
                </TabsTrigger>
              )}
            </TabsList>
          </HeaderTabsPortal>
          {(isTabVisible('overview', t.overview) ||
            isTabVisible('pnl', t.pnl) ||
            isTabVisible('balance', t.balance) ||
            isTabVisible('scenarios', t.scenarios) ||
            isTabVisible('collaborate', t.collaborate) ||
            isTabVisible('export', t.export)) && (
            <TabsList>
              {isTabVisible('overview', t.overview) && <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>}
              {isTabVisible('pnl', t.pnl) && <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>}
              {isTabVisible('balance', t.balance) && <TabsTrigger value="balance" className="text-xs">Balance Sheet</TabsTrigger>}
              {isTabVisible('scenarios', t.scenarios) && <TabsTrigger value="scenarios" className="text-xs">Scenarios</TabsTrigger>}
              {isTabVisible('collaborate', t.collaborate) && (
                <TabsTrigger value="collaborate" className="text-xs gap-1.5 relative">
                  Collaborate
                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] font-bold">3</Badge>
                </TabsTrigger>
              )}
              {isTabVisible('export', t.export) && (
                <TabsTrigger value="export" className="text-xs gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Board Pack
                </TabsTrigger>
              )}
            </TabsList>
          )}
        </Tabs>
      </div>

      {showAccessDenied ? (
        <AccessDenied />
      ) : (
        <Suspense fallback={<TabSkeleton />}>
          {/* Variance Legend */}
          {e.varianceLegend && activeTab !== 'cashflow' && <VarianceLegend compact />}

          {/* KPI Cards */}
          {e.kpiCards && activeTab !== 'cashflow' && (
            <KPICards onKPIClick={handleKPIClick} selectedKPI={selectedKPI} />
          )}

          {/* Tab Content — only active tab renders */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Income Statement is the primary module — full width. */}
              {e.plTable && (
                <InteractivePLTable comparisonMode={comparisonMode} dateRange={dateRange} />
              )}
              {/* Supporting charts sit beneath it as a follow-on section. */}
              <RevenueOPEXCharts chartConfig={chartConfig} visibilityConfig={c} />
            </div>
          )}

          {activeTab === 'pnl' && (
            <div className="space-y-4">
              {e.plTable && <InteractivePLTable comparisonMode={comparisonMode} dateRange={dateRange} />}
              <RevenueOPEXCharts chartConfig={chartConfig} visibilityConfig={c} />
            </div>
          )}

          {activeTab === 'balance' && <BalanceCashFlow view="balance" dateRange={dateRange} comparisonMode={comparisonMode} />}
          {activeTab === 'cashflow' && <CashFlowManager />}

          {activeTab === 'scenarios' && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              {s.scenarioModeling && <ScenarioModeling />}
              {s.sensitivityTable && <SensitivityTable />}
              {s.stressTesting && <StressTesting />}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              <BoardReportExport />
            </div>
          )}

          {activeTab === 'collaborate' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <VarianceReviewPanel />
              <BudgetApprovalWorkflow />
            </div>
          )}

          {activeTab === 'salesBdRoi' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              <BDRoiModule />
            </div>
          )}

        </Suspense>
      )}
    </div>
  );
}

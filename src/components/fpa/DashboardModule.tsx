import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CashFlowManager } from '@/components/cashflow/CashFlowManager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Settings2, Shield, Lock } from 'lucide-react';
import { KPICards } from './dashboard/KPICards';
import { InteractivePLTable } from './dashboard/InteractivePLTable';
import { RevenueOPEXCharts } from './dashboard/RevenueOPEXCharts';
import { BalanceCashFlow } from './dashboard/BalanceCashFlow';
import { ScenarioModeling } from './dashboard/ScenarioModeling';
import { StressTesting } from './dashboard/StressTesting';
import { SensitivityTable } from './dashboard/SensitivityTable';
import { VarianceReviewPanel } from './collaboration/VarianceReviewPanel';
import { BudgetApprovalWorkflow } from './collaboration/BudgetApprovalWorkflow';
import { VarianceLegend } from './VarianceLegend';
import { BoardReportExport } from './BoardReportExport';
import { BDRoiModule } from './bd-roi/BDRoiModule';
import { SalesModelModule } from './sales-model/SalesModelModule';
import { ChartConfigPanel, DEFAULT_CHART_CONFIG, type ChartConfig } from './dashboard/ChartConfigPanel';
import { FPADashboardConfigPanel } from './dashboard/FPADashboardConfigPanel';
import { useFPADashboardConfig } from '@/hooks/useFPADashboardConfig';
import { useFPATabPermissions } from '@/hooks/useFPATabPermissions';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';

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

export function DashboardModule() {
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [comparisonMode, setComparisonMode] = useState<'budget' | 'prior_year' | 'prior_period'>(getSmartComparison);
  const [dateRange, setDateRange] = useState(getSmartDateRange);
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [chartConfigOpen, setChartConfigOpen] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [teamConfigOpen, setTeamConfigOpen] = useState(false);

  const { config: fpaConfig, isAdmin, isSaving, saveConfig } = useFPADashboardConfig();
  const { allowedTabs, canViewTab } = useFPATabPermissions();
  const t = fpaConfig.tabs;
  const c = fpaConfig.charts;
  const e = fpaConfig.elements;
  const s = fpaConfig.scenarios;

  // Build visible tabs: must be enabled in config AND user has permission
  const isTabVisible = (tabKey: string, configEnabled?: boolean) => {
    const enabled = configEnabled !== undefined ? configEnabled : true;
    return enabled && canViewTab(tabKey);
  };

  // If current tab is not visible, fall back to first visible tab
  const visibleTabKeys: string[] = [];
  if (isTabVisible('overview', t.overview)) visibleTabKeys.push('overview');
  if (isTabVisible('pnl', t.pnl)) visibleTabKeys.push('pnl');
  if (isTabVisible('balance', t.balance)) visibleTabKeys.push('balance');
  if (isTabVisible('cashflow', t.cashflow)) visibleTabKeys.push('cashflow');
  if (isTabVisible('scenarios', t.scenarios)) visibleTabKeys.push('scenarios');
  if (isTabVisible('collaborate', t.collaborate)) visibleTabKeys.push('collaborate');
  if (isTabVisible('export', t.export)) visibleTabKeys.push('export');
  if (isTabVisible('salesBdRoi')) visibleTabKeys.push('salesBdRoi');
  if (isTabVisible('salesModel')) visibleTabKeys.push('salesModel');

  const activeTab = visibleTabKeys.includes(dashboardTab)
    ? dashboardTab
    : (visibleTabKeys[0] || 'overview');

  // Show access denied if user is on a tab they can't view (e.g. deep link)
  const showAccessDenied = !canViewTab(activeTab);

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

      {/* Global Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={activeTab} onValueChange={setDashboardTab}>
          <TabsList>
            {isTabVisible('overview', t.overview) && <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>}
            {isTabVisible('pnl', t.pnl) && <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>}
            {isTabVisible('balance', t.balance) && <TabsTrigger value="balance" className="text-xs">Balance Sheet</TabsTrigger>}
            {isTabVisible('cashflow', t.cashflow) && <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>}
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
            {isTabVisible('salesBdRoi') && <TabsTrigger value="salesBdRoi" className="text-xs">Sales & BD ROI</TabsTrigger>}
            {isTabVisible('salesModel') && <TabsTrigger value="salesModel" className="text-xs">Sales Model</TabsTrigger>}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setChartConfigOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Charts
            </Button>
          )}
          {e.exportButton && (
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setTeamConfigOpen(true)}>
                  <Shield className="h-3.5 w-3.5" /> Team Config
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Configure which elements are visible to your team</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {showAccessDenied ? (
        <AccessDenied />
      ) : (
        <>
          {/* Variance Legend */}
          {e.varianceLegend && <VarianceLegend compact />}

          {/* KPI Cards */}
          {e.kpiCards && (
            <KPICards onKPIClick={(kpi) => setSelectedKPI(kpi.id === selectedKPI ? null : kpi.id)} selectedKPI={selectedKPI} />
          )}

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                {e.plTable && (
                  <div className="xl:col-span-3">
                    <InteractivePLTable comparisonMode={comparisonMode} dateRange={dateRange} />
                  </div>
                )}
                <div className={e.plTable ? "xl:col-span-2 space-y-4" : "xl:col-span-5 space-y-4"}>
                  <RevenueOPEXCharts chartConfig={chartConfig} visibilityConfig={c} />
                </div>
              </div>
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

          {activeTab === 'salesModel' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
              <SalesModelModule />
            </div>
          )}
        </>
      )}
    </div>
  );
}

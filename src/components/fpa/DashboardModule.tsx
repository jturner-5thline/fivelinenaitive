import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Settings2, Shield } from 'lucide-react';
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
import { ChartConfigPanel, DEFAULT_CHART_CONFIG, type ChartConfig } from './dashboard/ChartConfigPanel';
import { FPADashboardConfigPanel } from './dashboard/FPADashboardConfigPanel';
import { useFPADashboardConfig } from '@/hooks/useFPADashboardConfig';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Smart default: pick date range based on current month
function getSmartDateRange(): string {
  const month = new Date().getMonth(); // 0-indexed
  if (month <= 2) return '3m'; // Q1: short window
  if (month <= 5) return '6m'; // Q2: half year
  return 'ytd'; // H2: year-to-date
}

function getSmartComparison(): 'budget' | 'forecast' | 'prior_year' {
  const month = new Date().getMonth();
  if (month >= 9) return 'budget'; // Q4: compare to next-year budget
  return 'budget';
}

export function DashboardModule() {
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [comparisonMode, setComparisonMode] = useState<'budget' | 'forecast' | 'prior_year'>(getSmartComparison);
  const [dateRange, setDateRange] = useState(getSmartDateRange);
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [chartConfigOpen, setChartConfigOpen] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [teamConfigOpen, setTeamConfigOpen] = useState(false);

  const { config: fpaConfig, isAdmin, isSaving, saveConfig } = useFPADashboardConfig();
  const t = fpaConfig.tabs;
  const c = fpaConfig.charts;
  const e = fpaConfig.elements;
  const s = fpaConfig.scenarios;

  // If current tab is disabled, fall back to first enabled tab
  const enabledTabs = Object.entries(t).filter(([, v]) => v).map(([k]) => k);
  const activeTab = t[dashboardTab as keyof typeof t] ? dashboardTab : (enabledTabs[0] || 'overview');

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
            {t.overview && <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>}
            {t.pnl && <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>}
            {t.balance && <TabsTrigger value="balance" className="text-xs">Balance Sheet</TabsTrigger>}
            {t.cashflow && <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>}
            {t.scenarios && <TabsTrigger value="scenarios" className="text-xs">Scenarios</TabsTrigger>}
            {t.collaborate && (
              <TabsTrigger value="collaborate" className="text-xs gap-1.5 relative">
                Collaborate
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] font-bold">3</Badge>
              </TabsTrigger>
            )}
            {t.export && (
              <TabsTrigger value="export" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Board Pack
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {e.comparisonFilter && (
            <Select value={comparisonMode} onValueChange={(v) => setComparisonMode(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="budget">vs Budget</SelectItem>
                <SelectItem value="forecast">vs Forecast</SelectItem>
                <SelectItem value="prior_year">vs Prior Year</SelectItem>
              </SelectContent>
            </Select>
          )}
          {e.dateRangeFilter && (
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">Last 3M</SelectItem>
                <SelectItem value="6m">Last 6M</SelectItem>
                <SelectItem value="12m">Last 12M</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
              </SelectContent>
            </Select>
          )}
          {e.chartConfigButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setChartConfigOpen(true)}
            >
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setTeamConfigOpen(true)}
                >
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
                <InteractivePLTable comparisonMode={comparisonMode} />
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
          {e.plTable && <InteractivePLTable comparisonMode={comparisonMode} />}
          <RevenueOPEXCharts chartConfig={chartConfig} visibilityConfig={c} />
        </div>
      )}

      {activeTab === 'balance' && <BalanceCashFlow view="balance" />}

      {activeTab === 'cashflow' && <BalanceCashFlow view="cashflow" />}

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
    </div>
  );
}

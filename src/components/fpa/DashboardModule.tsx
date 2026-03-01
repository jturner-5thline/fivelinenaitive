import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Share2 } from 'lucide-react';
import { KPICards } from './dashboard/KPICards';
import { InteractivePLTable } from './dashboard/InteractivePLTable';
import { RevenueOPEXCharts } from './dashboard/RevenueOPEXCharts';
import { BalanceCashFlow } from './dashboard/BalanceCashFlow';
import { ScenarioModeling } from './dashboard/ScenarioModeling';
import { StressTesting } from './dashboard/StressTesting';
import { SensitivityTable } from './dashboard/SensitivityTable';
import { VarianceReviewPanel } from './collaboration/VarianceReviewPanel';
import { BudgetApprovalWorkflow } from './collaboration/BudgetApprovalWorkflow';

export function DashboardModule() {
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [comparisonMode, setComparisonMode] = useState<'budget' | 'forecast' | 'prior_year'>('budget');
  const [dateRange, setDateRange] = useState('6m');
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Global Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={dashboardTab} onValueChange={setDashboardTab}>
          <TabsList>
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>
            <TabsTrigger value="balance" className="text-xs">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>
            <TabsTrigger value="scenarios" className="text-xs">Scenarios</TabsTrigger>
            <TabsTrigger value="collaborate" className="text-xs">Collaborate</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* KPI Cards — always visible */}
      <KPICards onKPIClick={(kpi) => setSelectedKPI(kpi.id === selectedKPI ? null : kpi.id)} selectedKPI={selectedKPI} />

      {/* Tab Content */}
      {dashboardTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3">
              <InteractivePLTable comparisonMode={comparisonMode} />
            </div>
            <div className="xl:col-span-2 space-y-4">
              <RevenueOPEXCharts />
            </div>
          </div>
        </div>
      )}

      {dashboardTab === 'pnl' && (
        <div className="space-y-4">
          <InteractivePLTable comparisonMode={comparisonMode} />
          <RevenueOPEXCharts />
        </div>
      )}

      {dashboardTab === 'balance' && (
        <BalanceCashFlow view="balance" />
      )}

      {dashboardTab === 'cashflow' && (
        <BalanceCashFlow view="cashflow" />
      )}

      {dashboardTab === 'scenarios' && (
        <div className="space-y-4">
          <ScenarioModeling />
          <SensitivityTable />
          <StressTesting />
        </div>
      )}

      {dashboardTab === 'collaborate' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <VarianceReviewPanel />
          <BudgetApprovalWorkflow />
        </div>
      )}
    </div>
  );
}
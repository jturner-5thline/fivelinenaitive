import { useState, useCallback } from "react";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceDateRangePicker } from "@/components/finance/FinanceDateRangePicker";
import { ProfitAndLossStatementRange } from "@/components/finance/ProfitAndLossStatementRange";
import { BalanceSheetStatementRange } from "@/components/finance/BalanceSheetStatementRange";
import { CashFlowStatementRange } from "@/components/finance/CashFlowStatementRange";
import { FinanceChangeLog } from "@/components/finance/FinanceChangeLog";
import { DriverInputsPanel, useDriverInputs, DriverInputs } from "@/components/finance/DriverInputsPanel";
import { FinancialKPIDashboard } from "@/components/finance/FinancialKPIDashboard";
import { FinanceLayoutToggle, DriverLayout } from "@/components/finance/FinanceLayoutToggle";
import { SpreadsheetWorkspace } from "@/components/finance/spreadsheet/SpreadsheetWorkspace";
import { ScenarioManager } from "@/components/finance/ScenarioManager";
import { RevenueForecast } from "@/components/finance/RevenueForecast";
import { BudgetVsActuals } from "@/components/finance/BudgetVsActuals";
import { SensitivityAnalysis } from "@/components/finance/SensitivityAnalysis";
import { PnLTrendCharts } from "@/components/finance/PnLTrendCharts";
import { CashFlowWaterfall } from "@/components/finance/CashFlowWaterfall";
import { GoalSeek, CashFlowStressTests, CovenantCompliance } from "@/components/finance/GoalSeekAndStress";
import { FinanceExport } from "@/components/finance/FinanceExport";
import { useFinanceDataRange, FinancePeriodType } from "@/hooks/useFinanceDataRange";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, TrendingUp, Wallet, ArrowDownUp, History, BarChart3, 
  FileSpreadsheet, GitBranch, Target, Zap, Download
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Finance() {
  const { company, isLoading: companyLoading } = useCompany();
  const [periodType, setPeriodType] = useState<FinancePeriodType>('monthly');
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(subMonths(new Date(), 5)));
  const [endDate, setEndDate] = useState<Date>(() => endOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState("workbook");
  const [driverLayout, setDriverLayout] = useState<DriverLayout>('sidebar');
  const [showFormulas, setShowFormulas] = useState(false);
  
  const { inputs: driverInputs, handleInputChange, resetToDefaults } = useDriverInputs();

  const { 
    periods, 
    categories, 
    lineItems, 
    financialData, 
    changeLogs,
    periodColumns,
    isLoading, 
    updateFinancialData,
    createPeriod,
    refreshData
  } = useFinanceDataRange(company?.id, periodType, startDate, endDate);

  const handleApplyDrivers = useCallback(() => {
    toast.success('Drivers applied', {
      description: 'Financial calculations updated with new driver values'
    });
    refreshData();
  }, [refreshData]);

  if (companyLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!company) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Company Found</h2>
              <p className="text-muted-foreground text-center">
                You need to be part of a company to access financial data.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const isStatementTab = ['pnl', 'balance', 'cashflow', 'kpis', 'history'].includes(activeTab);
  const showDriversPanel = driverLayout !== 'hidden' && isStatementTab;
  const isSidebarLayout = driverLayout === 'sidebar';

  const pnlLineItems = lineItems.filter(li => li.statement_type === 'pnl');
  const bsLineItems = lineItems.filter(li => li.statement_type === 'balance_sheet');
  const cfLineItems = lineItems.filter(li => li.statement_type === 'cash_flow');

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">
              Finance
            </h1>
            <p className="text-muted-foreground text-sm">
              Financial modeling, forecasting, and analysis for {company.name}
            </p>
          </div>
          {isStatementTab && (
            <div className="flex items-center gap-3 flex-wrap">
              <FinanceLayoutToggle 
                layout={driverLayout} 
                onLayoutChange={setDriverLayout}
              />
              <FinanceDateRangePicker
                periodType={periodType}
                setPeriodType={setPeriodType}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
              />
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
              <TabsTrigger value="workbook" className="flex items-center gap-1.5 px-3">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Workbook</span>
              </TabsTrigger>
              <TabsTrigger value="pnl" className="flex items-center gap-1.5 px-3">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">P&L</span>
              </TabsTrigger>
              <TabsTrigger value="balance" className="flex items-center gap-1.5 px-3">
                <Wallet className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Balance</span>
              </TabsTrigger>
              <TabsTrigger value="cashflow" className="flex items-center gap-1.5 px-3">
                <ArrowDownUp className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Cash Flow</span>
              </TabsTrigger>
              <TabsTrigger value="kpis" className="flex items-center gap-1.5 px-3">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">KPIs</span>
              </TabsTrigger>
              <TabsTrigger value="forecast" className="flex items-center gap-1.5 px-3">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Forecast</span>
              </TabsTrigger>
              <TabsTrigger value="scenarios" className="flex items-center gap-1.5 px-3">
                <GitBranch className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Scenarios</span>
              </TabsTrigger>
              <TabsTrigger value="variance" className="flex items-center gap-1.5 px-3">
                <Target className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Variance</span>
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex items-center gap-1.5 px-3">
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Analysis</span>
              </TabsTrigger>
              <TabsTrigger value="export" className="flex items-center gap-1.5 px-3">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Export</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-1.5 px-3">
                <History className="h-3.5 w-3.5" />
                <span className="hidden lg:inline text-xs">Log</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Workbook Tab */}
          <TabsContent value="workbook" className="mt-0">
            <SpreadsheetWorkspace />
          </TabsContent>

          {/* Driver Inputs - Top Layout (for statement tabs) */}
          {showDriversPanel && !isSidebarLayout && (
            <DriverInputsPanel
              inputs={driverInputs}
              onInputChange={handleInputChange}
              onApplyDrivers={handleApplyDrivers}
              showFormulas={showFormulas}
              onToggleFormulas={setShowFormulas}
              layout="top"
            />
          )}

          {/* Statement tabs with optional sidebar */}
          <div className={cn(
            "flex gap-6",
            isSidebarLayout && showDriversPanel ? "flex-row" : "flex-col"
          )}>
            {showDriversPanel && isSidebarLayout && (
              <DriverInputsPanel
                inputs={driverInputs}
                onInputChange={handleInputChange}
                onApplyDrivers={handleApplyDrivers}
                showFormulas={showFormulas}
                onToggleFormulas={setShowFormulas}
                layout="sidebar"
              />
            )}

            <div className="flex-1 min-w-0">
              <TabsContent value="pnl">
                <div className="space-y-4">
                  <ProfitAndLossStatementRange
                    companyId={company.id}
                    periodType={periodType}
                    periodColumns={periodColumns}
                    categories={categories.filter(c => c.statement_type === 'pnl')}
                    lineItems={pnlLineItems}
                    financialData={financialData}
                    isLoading={isLoading}
                    onUpdateData={updateFinancialData}
                    onCreatePeriod={createPeriod}
                    onRefresh={refreshData}
                  />
                  <PnLTrendCharts
                    periodColumns={periodColumns}
                    financialData={financialData}
                    lineItems={[...pnlLineItems, ...bsLineItems]}
                  />
                </div>
              </TabsContent>

              <TabsContent value="balance">
                <BalanceSheetStatementRange
                  companyId={company.id}
                  periodType={periodType}
                  periodColumns={periodColumns}
                  categories={categories.filter(c => c.statement_type === 'balance_sheet')}
                  lineItems={bsLineItems}
                  financialData={financialData}
                  isLoading={isLoading}
                  onUpdateData={updateFinancialData}
                  onCreatePeriod={createPeriod}
                  onRefresh={refreshData}
                />
              </TabsContent>

              <TabsContent value="cashflow">
                <div className="space-y-4">
                  <CashFlowStatementRange
                    companyId={company.id}
                    periodType={periodType}
                    periodColumns={periodColumns}
                    categories={categories.filter(c => c.statement_type === 'cash_flow')}
                    lineItems={cfLineItems}
                    financialData={financialData}
                    isLoading={isLoading}
                    onUpdateData={updateFinancialData}
                    onCreatePeriod={createPeriod}
                    onRefresh={refreshData}
                  />
                  <CashFlowWaterfall
                    periodColumns={periodColumns}
                    financialData={financialData}
                    lineItems={cfLineItems}
                  />
                </div>
              </TabsContent>

              <TabsContent value="kpis">
                <FinancialKPIDashboard
                  periodColumns={periodColumns}
                  financialData={financialData}
                  lineItems={[...pnlLineItems, ...bsLineItems]}
                  driverInputs={driverInputs}
                  showFormulas={showFormulas}
                />
              </TabsContent>

              <TabsContent value="forecast">
                <RevenueForecast />
              </TabsContent>

              <TabsContent value="scenarios">
                <div className="space-y-4">
                  <ScenarioManager />
                  <SensitivityAnalysis />
                </div>
              </TabsContent>

              <TabsContent value="variance">
                <BudgetVsActuals />
              </TabsContent>

              <TabsContent value="analysis">
                <div className="space-y-4">
                  <GoalSeek />
                  <CashFlowStressTests />
                  <CovenantCompliance />
                </div>
              </TabsContent>

              <TabsContent value="export">
                <FinanceExport />
              </TabsContent>

              <TabsContent value="history">
                <FinanceChangeLog
                  changeLogs={changeLogs}
                  lineItems={lineItems}
                  periods={periods}
                  isLoading={isLoading}
                />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}

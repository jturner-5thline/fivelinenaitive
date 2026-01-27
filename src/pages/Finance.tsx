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
import { useFinanceDataRange, FinancePeriodType } from "@/hooks/useFinanceDataRange";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, TrendingUp, Wallet, ArrowDownUp, History, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Finance() {
  const { company, isLoading: companyLoading } = useCompany();
  const [periodType, setPeriodType] = useState<FinancePeriodType>('monthly');
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(subMonths(new Date(), 5)));
  const [endDate, setEndDate] = useState<Date>(() => endOfMonth(new Date()));
  const [activeTab, setActiveTab] = useState("pnl");
  const [driverLayout, setDriverLayout] = useState<DriverLayout>('sidebar');
  const [showFormulas, setShowFormulas] = useState(false);
  
  // Driver inputs state
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

  const showDriversPanel = driverLayout !== 'hidden';
  const isSidebarLayout = driverLayout === 'sidebar';

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-brand-gradient bg-clip-text text-transparent">
              Finance
            </h1>
            <p className="text-muted-foreground">
              Financial forecasting and tracking for {company.name}
            </p>
          </div>
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
        </div>

        {/* Driver Inputs - Top Layout */}
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

        {/* Main content with optional sidebar */}
        <div className={cn(
          "flex gap-6",
          isSidebarLayout && showDriversPanel ? "flex-row" : "flex-col"
        )}>
          {/* Driver Inputs - Sidebar Layout */}
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

          {/* Statements Tabs */}
          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full max-w-[750px] grid-cols-5">
                <TabsTrigger value="pnl" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">P&L</span>
                </TabsTrigger>
                <TabsTrigger value="balance" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">Balance Sheet</span>
                </TabsTrigger>
                <TabsTrigger value="cashflow" className="flex items-center gap-2">
                  <ArrowDownUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Cash Flow</span>
                </TabsTrigger>
                <TabsTrigger value="kpis" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">KPIs & Ratios</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Change Log</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pnl">
                <ProfitAndLossStatementRange
                  companyId={company.id}
                  periodType={periodType}
                  periodColumns={periodColumns}
                  categories={categories.filter(c => c.statement_type === 'pnl')}
                  lineItems={lineItems.filter(li => li.statement_type === 'pnl')}
                  financialData={financialData}
                  isLoading={isLoading}
                  onUpdateData={updateFinancialData}
                  onCreatePeriod={createPeriod}
                  onRefresh={refreshData}
                />
              </TabsContent>

              <TabsContent value="balance">
                <BalanceSheetStatementRange
                  companyId={company.id}
                  periodType={periodType}
                  periodColumns={periodColumns}
                  categories={categories.filter(c => c.statement_type === 'balance_sheet')}
                  lineItems={lineItems.filter(li => li.statement_type === 'balance_sheet')}
                  financialData={financialData}
                  isLoading={isLoading}
                  onUpdateData={updateFinancialData}
                  onCreatePeriod={createPeriod}
                  onRefresh={refreshData}
                />
              </TabsContent>

              <TabsContent value="cashflow">
                <CashFlowStatementRange
                  companyId={company.id}
                  periodType={periodType}
                  periodColumns={periodColumns}
                  categories={categories.filter(c => c.statement_type === 'cash_flow')}
                  lineItems={lineItems.filter(li => li.statement_type === 'cash_flow')}
                  financialData={financialData}
                  isLoading={isLoading}
                  onUpdateData={updateFinancialData}
                  onCreatePeriod={createPeriod}
                  onRefresh={refreshData}
                />
              </TabsContent>

              <TabsContent value="kpis">
                <FinancialKPIDashboard
                  periodColumns={periodColumns}
                  financialData={financialData}
                  lineItems={lineItems.filter(li => 
                    li.statement_type === 'pnl' || li.statement_type === 'balance_sheet'
                  )}
                  driverInputs={driverInputs}
                  showFormulas={showFormulas}
                />
              </TabsContent>

              <TabsContent value="history">
                <FinanceChangeLog
                  changeLogs={changeLogs}
                  lineItems={lineItems}
                  periods={periods}
                  isLoading={isLoading}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
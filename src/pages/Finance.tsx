import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancePeriodSelector } from "@/components/finance/FinancePeriodSelector";
import { ProfitAndLossStatement } from "@/components/finance/ProfitAndLossStatement";
import { BalanceSheetStatement } from "@/components/finance/BalanceSheetStatement";
import { CashFlowStatement } from "@/components/finance/CashFlowStatement";
import { FinanceChangeLog } from "@/components/finance/FinanceChangeLog";
import { useFinanceData } from "@/hooks/useFinanceData";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, Wallet, ArrowDownUp, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export type FinancePeriodType = 'monthly' | 'quarterly' | 'annual';

export default function Finance() {
  const { company, isLoading: companyLoading } = useCompany();
  const [periodType, setPeriodType] = useState<FinancePeriodType>('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(new Date().getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number | undefined>(Math.ceil((new Date().getMonth() + 1) / 3));
  const [activeTab, setActiveTab] = useState("pnl");

  const { 
    periods, 
    categories, 
    lineItems, 
    financialData, 
    changeLogs,
    isLoading, 
    updateFinancialData,
    createPeriod,
    refreshData
  } = useFinanceData(company?.id, periodType, selectedYear, selectedMonth, selectedQuarter);

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
          <FinancePeriodSelector
            periodType={periodType}
            setPeriodType={setPeriodType}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            selectedQuarter={selectedQuarter}
            setSelectedQuarter={setSelectedQuarter}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full max-w-[600px] grid-cols-4">
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
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Change Log</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pnl">
            <ProfitAndLossStatement
              companyId={company.id}
              periodType={periodType}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedQuarter={selectedQuarter}
              periods={periods}
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
            <BalanceSheetStatement
              companyId={company.id}
              periodType={periodType}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedQuarter={selectedQuarter}
              periods={periods}
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
            <CashFlowStatement
              companyId={company.id}
              periodType={periodType}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              selectedQuarter={selectedQuarter}
              periods={periods}
              categories={categories.filter(c => c.statement_type === 'cash_flow')}
              lineItems={lineItems.filter(li => li.statement_type === 'cash_flow')}
              financialData={financialData}
              isLoading={isLoading}
              onUpdateData={updateFinancialData}
              onCreatePeriod={createPeriod}
              onRefresh={refreshData}
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
    </AppLayout>
  );
}

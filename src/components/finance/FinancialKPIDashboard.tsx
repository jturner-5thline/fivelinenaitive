import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  Activity, 
  Scale,
  Wallet,
  Calculator,
  BarChart3,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyInputValue } from "@/utils/currencyFormat";
import { FinancialLineItem, FinancialDataEntry, PeriodColumn } from "@/hooks/useFinanceDataRange";
import { DriverInputs } from "./DriverInputsPanel";

interface FinancialKPIDashboardProps {
  periodColumns: PeriodColumn[];
  financialData: FinancialDataEntry[];
  lineItems: FinancialLineItem[];
  driverInputs: DriverInputs;
  showFormulas: boolean;
  className?: string;
}

interface KPIMetric {
  label: string;
  value: string | number;
  formula: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon: React.ReactNode;
  category: 'profitability' | 'liquidity' | 'leverage' | 'efficiency' | 'cash_flow';
}

export function FinancialKPIDashboard({
  periodColumns,
  financialData,
  lineItems,
  driverInputs,
  showFormulas,
  className,
}: FinancialKPIDashboardProps) {
  // Get latest period with data
  const latestPeriod = useMemo(() => {
    const periodsWithData = periodColumns.filter(col => col.period);
    return periodsWithData[periodsWithData.length - 1];
  }, [periodColumns]);

  const priorPeriod = useMemo(() => {
    const periodsWithData = periodColumns.filter(col => col.period);
    return periodsWithData[periodsWithData.length - 2];
  }, [periodColumns]);

  // Helper to get amount for a line item in a period
  const getAmount = (periodId: string | undefined, lineItemName: string): number => {
    if (!periodId) return 0;
    const lineItem = lineItems.find(li => li.name.toLowerCase().includes(lineItemName.toLowerCase()));
    if (!lineItem) return 0;
    const data = financialData.find(d => d.period_id === periodId && d.line_item_id === lineItem.id);
    return data?.amount || 0;
  };

  // Calculate KPIs
  const kpis = useMemo((): KPIMetric[] => {
    const currentPeriodId = latestPeriod?.period?.id;
    const priorPeriodId = priorPeriod?.period?.id;

    // Get key financial line items (looking for common names)
    const revenue = getAmount(currentPeriodId, 'revenue') || getAmount(currentPeriodId, 'sales') || 1000000;
    const priorRevenue = getAmount(priorPeriodId, 'revenue') || getAmount(priorPeriodId, 'sales') || 900000;
    const cogs = getAmount(currentPeriodId, 'cost of goods') || getAmount(currentPeriodId, 'cogs') || revenue * 0.55;
    const grossProfit = revenue - cogs;
    const operatingExpenses = getAmount(currentPeriodId, 'operating') || revenue * 0.25;
    const operatingIncome = grossProfit - operatingExpenses;
    const depreciation = getAmount(currentPeriodId, 'depreciation') || revenue * 0.03;
    const amortization = getAmount(currentPeriodId, 'amortization') || 0;
    const ebitda = operatingIncome + depreciation + amortization;
    const interestExpense = driverInputs.debtBalance * (driverInputs.interestRate / 100);
    const ebt = operatingIncome - interestExpense;
    const taxes = ebt * (driverInputs.taxRate / 100);
    const netIncome = ebt - taxes;
    
    // Balance sheet items (estimates if not available)
    const currentAssets = getAmount(currentPeriodId, 'current assets') || revenue * 0.3;
    const currentLiabilities = getAmount(currentPeriodId, 'current liabilities') || revenue * 0.2;
    const totalAssets = getAmount(currentPeriodId, 'total assets') || revenue * 1.2;
    const totalEquity = getAmount(currentPeriodId, 'equity') || getAmount(currentPeriodId, 'retained') || totalAssets * 0.4;
    const totalDebt = driverInputs.debtBalance;
    const cash = getAmount(currentPeriodId, 'cash') || revenue * 0.1;
    const inventory = getAmount(currentPeriodId, 'inventory') || revenue * (driverInputs.daysInventory / 365);
    const receivables = revenue * (driverInputs.daysReceivable / 365);
    const payables = cogs * (driverInputs.daysPayable / 365);
    
    // Cash flow items
    const capex = revenue * (driverInputs.capexAsRevenuePercent / 100);
    const changeInNWC = (receivables + inventory) - payables;
    const fcf = ebitda - taxes - capex - changeInNWC;

    // Calculate metrics
    const grossMargin = (grossProfit / revenue) * 100;
    const operatingMargin = (operatingIncome / revenue) * 100;
    const netMargin = (netIncome / revenue) * 100;
    const ebitdaMargin = (ebitda / revenue) * 100;
    const currentRatio = currentAssets / currentLiabilities;
    const quickRatio = (currentAssets - inventory) / currentLiabilities;
    const debtToEquity = totalDebt / totalEquity;
    const interestCoverage = interestExpense > 0 ? ebitda / interestExpense : 999;
    const roe = (netIncome / totalEquity) * 100;
    const roa = (netIncome / totalAssets) * 100;
    const nwc = currentAssets - currentLiabilities;
    const revenueGrowth = priorRevenue > 0 ? ((revenue - priorRevenue) / priorRevenue) * 100 : 0;

    return [
      // Profitability
      {
        label: 'EBITDA',
        value: `$${formatCurrencyInputValue(ebitda)}`,
        formula: '=Operating_Income + D&A',
        trend: ebitda > 0 ? 'up' : 'down',
        trendValue: `${ebitdaMargin.toFixed(1)}% margin`,
        icon: <DollarSign className="h-4 w-4" />,
        category: 'profitability'
      },
      {
        label: 'Gross Margin',
        value: `${grossMargin.toFixed(1)}%`,
        formula: '=(Revenue - COGS) / Revenue',
        trend: grossMargin > 40 ? 'up' : grossMargin > 30 ? 'neutral' : 'down',
        icon: <Percent className="h-4 w-4" />,
        category: 'profitability'
      },
      {
        label: 'Operating Margin',
        value: `${operatingMargin.toFixed(1)}%`,
        formula: '=Operating_Income / Revenue',
        trend: operatingMargin > 15 ? 'up' : operatingMargin > 10 ? 'neutral' : 'down',
        icon: <Percent className="h-4 w-4" />,
        category: 'profitability'
      },
      {
        label: 'Net Margin',
        value: `${netMargin.toFixed(1)}%`,
        formula: '=Net_Income / Revenue',
        trend: netMargin > 10 ? 'up' : netMargin > 5 ? 'neutral' : 'down',
        icon: <Percent className="h-4 w-4" />,
        category: 'profitability'
      },
      // Efficiency
      {
        label: 'ROE',
        value: `${roe.toFixed(1)}%`,
        formula: '=Net_Income / Shareholders_Equity',
        trend: roe > 15 ? 'up' : roe > 10 ? 'neutral' : 'down',
        icon: <TrendingUp className="h-4 w-4" />,
        category: 'efficiency'
      },
      {
        label: 'ROA',
        value: `${roa.toFixed(1)}%`,
        formula: '=Net_Income / Total_Assets',
        trend: roa > 5 ? 'up' : roa > 3 ? 'neutral' : 'down',
        icon: <BarChart3 className="h-4 w-4" />,
        category: 'efficiency'
      },
      // Liquidity
      {
        label: 'Current Ratio',
        value: currentRatio.toFixed(2),
        formula: '=Current_Assets / Current_Liabilities',
        trend: currentRatio > 1.5 ? 'up' : currentRatio > 1 ? 'neutral' : 'down',
        icon: <Scale className="h-4 w-4" />,
        category: 'liquidity'
      },
      {
        label: 'Quick Ratio',
        value: quickRatio.toFixed(2),
        formula: '=(Current_Assets - Inventory) / Current_Liabilities',
        trend: quickRatio > 1 ? 'up' : quickRatio > 0.8 ? 'neutral' : 'down',
        icon: <Activity className="h-4 w-4" />,
        category: 'liquidity'
      },
      // Leverage
      {
        label: 'Debt/Equity',
        value: debtToEquity.toFixed(2),
        formula: '=Total_Debt / Total_Equity',
        trend: debtToEquity < 1 ? 'up' : debtToEquity < 2 ? 'neutral' : 'down',
        icon: <Scale className="h-4 w-4" />,
        category: 'leverage'
      },
      {
        label: 'Interest Coverage',
        value: interestCoverage > 100 ? '>100x' : `${interestCoverage.toFixed(1)}x`,
        formula: '=EBITDA / Interest_Expense',
        trend: interestCoverage > 3 ? 'up' : interestCoverage > 1.5 ? 'neutral' : 'down',
        icon: <Calculator className="h-4 w-4" />,
        category: 'leverage'
      },
      // Cash Flow
      {
        label: 'Free Cash Flow',
        value: `$${formatCurrencyInputValue(fcf)}`,
        formula: '=EBITDA - Taxes - CapEx - ΔNWC',
        trend: fcf > 0 ? 'up' : 'down',
        icon: <Wallet className="h-4 w-4" />,
        category: 'cash_flow'
      },
      {
        label: 'Net Working Capital',
        value: `$${formatCurrencyInputValue(nwc)}`,
        formula: '=Current_Assets - Current_Liabilities',
        trend: nwc > 0 ? 'up' : 'down',
        icon: <Activity className="h-4 w-4" />,
        category: 'cash_flow'
      },
    ];
  }, [latestPeriod, priorPeriod, financialData, lineItems, driverInputs]);

  const categoryLabels: Record<string, { label: string; color: string }> = {
    profitability: { label: 'Profitability', color: 'text-success' },
    efficiency: { label: 'Efficiency', color: 'text-primary' },
    liquidity: { label: 'Liquidity', color: 'text-warning' },
    leverage: { label: 'Leverage', color: 'text-destructive' },
    cash_flow: { label: 'Cash Flow', color: 'text-muted-foreground' },
  };

  const groupedKPIs = useMemo(() => {
    const groups: Record<string, KPIMetric[]> = {};
    kpis.forEach(kpi => {
      if (!groups[kpi.category]) groups[kpi.category] = [];
      groups[kpi.category].push(kpi);
    });
    return groups;
  }, [kpis]);

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Financial KPIs & Ratios
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {latestPeriod?.shortLabel || 'No Data'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {kpis.map((kpi, index) => (
            <TooltipProvider key={index}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors cursor-help",
                    "flex flex-col gap-1"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs text-muted-foreground",
                        categoryLabels[kpi.category]?.color
                      )}>
                        {kpi.icon}
                      </span>
                      {kpi.trend && (
                        <span className={cn(
                          kpi.trend === 'up' && 'text-success',
                          kpi.trend === 'down' && 'text-destructive',
                          kpi.trend === 'neutral' && 'text-muted-foreground'
                        )}>
                          {kpi.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                          {kpi.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                    <p className="text-sm font-semibold">{kpi.value}</p>
                    {kpi.trendValue && (
                      <p className="text-[10px] text-muted-foreground">{kpi.trendValue}</p>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{kpi.label}</p>
                    {showFormulas && (
                      <p className="text-xs font-mono bg-muted/50 px-2 py-1 rounded">
                        {kpi.formula}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useCallback, useMemo, useEffect } from 'react';

export interface ModelAssumptions {
  companyName: string;
  fiscalYearEnd: string;
  modelDate: string;
  // Revenue
  revenueGrowthRates: number[]; // 5 years
  startingMRR: number;
  monthlyChurnRate: number;
  avgRevenuePerCustomer: number;
  startingCustomers: number;
  newCustomersPerMonth: number;
  // Costs
  cogsPercent: number;
  salesMarketingPercent: number;
  rdPercent: number;
  gaPercent: number;
  // Headcount
  startingHeadcount: number;
  monthlyHiringRate: number;
  fullyLoadedCostPerEmployee: number;
  // Capital
  startingCash: number;
  fundingRounds: { month: number; amount: number }[];
}

export interface MonthlyData {
  month: number;
  year: number;
  label: string;
  newCustomers: number;
  totalCustomers: number;
  churnedCustomers: number;
  mrr: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  salesMarketing: number;
  rd: number;
  ga: number;
  headcount: number;
  headcountCost: number;
  totalOpex: number;
  operatingIncome: number;
  cashFlow: number;
  cashBalance: number;
}

export interface AnnualData {
  year: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  salesMarketing: number;
  rd: number;
  ga: number;
  headcountCost: number;
  totalOpex: number;
  operatingIncome: number;
  operatingMargin: number;
  netIncome: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashChange: number;
  endingCash: number;
}

const defaultAssumptions: ModelAssumptions = {
  companyName: 'TechCo Inc.',
  fiscalYearEnd: 'December',
  modelDate: new Date().toISOString().split('T')[0],
  revenueGrowthRates: [0.20, 0.18, 0.15, 0.12, 0.10],
  startingMRR: 50000,
  monthlyChurnRate: 0.05,
  avgRevenuePerCustomer: 500,
  startingCustomers: 100,
  newCustomersPerMonth: 15,
  cogsPercent: 0.25,
  salesMarketingPercent: 0.30,
  rdPercent: 0.20,
  gaPercent: 0.15,
  startingHeadcount: 10,
  monthlyHiringRate: 1,
  fullyLoadedCostPerEmployee: 12000,
  startingCash: 2000000,
  fundingRounds: [{ month: 12, amount: 5000000 }],
};

const STORAGE_KEY = 'financial-model-assumptions';

export function useFinancialModel(dealId: string) {
  const storageKey = `${STORAGE_KEY}-${dealId}`;
  
  const [assumptions, setAssumptions] = useState<ModelAssumptions>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? { ...defaultAssumptions, ...JSON.parse(saved) } : defaultAssumptions;
  });

  const [undoStack, setUndoStack] = useState<ModelAssumptions[]>([]);
  const [redoStack, setRedoStack] = useState<ModelAssumptions[]>([]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(assumptions));
  }, [assumptions, storageKey]);

  const updateAssumption = useCallback(<K extends keyof ModelAssumptions>(
    key: K,
    value: ModelAssumptions[K]
  ) => {
    setUndoStack(prev => [...prev.slice(-20), assumptions]);
    setRedoStack([]);
    setAssumptions(prev => ({ ...prev, [key]: value }));
  }, [assumptions]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, assumptions]);
    setUndoStack(prev => prev.slice(0, -1));
    setAssumptions(previous);
  }, [undoStack, assumptions]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, assumptions]);
    setRedoStack(prev => prev.slice(0, -1));
    setAssumptions(next);
  }, [redoStack, assumptions]);

  // Calculate monthly data for 60 months (5 years)
  const monthlyData = useMemo((): MonthlyData[] => {
    const months: MonthlyData[] = [];
    let totalCustomers = assumptions.startingCustomers;
    let mrr = assumptions.startingMRR;
    let cashBalance = assumptions.startingCash;
    let headcount = assumptions.startingHeadcount;
    
    const startYear = new Date().getFullYear();
    
    for (let i = 0; i < 60; i++) {
      const year = Math.floor(i / 12);
      const monthIndex = i % 12;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Apply growth rate
      const yearlyGrowthRate = assumptions.revenueGrowthRates[Math.min(year, 4)] || 0.10;
      const monthlyGrowthRate = Math.pow(1 + yearlyGrowthRate, 1/12) - 1;
      
      // Customer calculations
      const newCustomers = Math.round(assumptions.newCustomersPerMonth * (1 + monthlyGrowthRate * i));
      const churnedCustomers = Math.round(totalCustomers * assumptions.monthlyChurnRate);
      totalCustomers = totalCustomers + newCustomers - churnedCustomers;
      
      // Revenue
      mrr = totalCustomers * assumptions.avgRevenuePerCustomer;
      const revenue = mrr;
      
      // Costs
      const cogs = revenue * assumptions.cogsPercent;
      const grossProfit = revenue - cogs;
      const salesMarketing = revenue * assumptions.salesMarketingPercent;
      const rd = revenue * assumptions.rdPercent;
      const ga = revenue * assumptions.gaPercent;
      
      // Headcount
      headcount = Math.round(assumptions.startingHeadcount + (i * assumptions.monthlyHiringRate));
      const headcountCost = headcount * assumptions.fullyLoadedCostPerEmployee;
      
      const totalOpex = salesMarketing + rd + ga + headcountCost;
      const operatingIncome = grossProfit - totalOpex;
      
      // Cash flow
      const funding = assumptions.fundingRounds.find(f => f.month === i + 1)?.amount || 0;
      const cashFlow = operatingIncome + funding;
      cashBalance = cashBalance + cashFlow;
      
      months.push({
        month: monthIndex + 1,
        year: startYear + year,
        label: `${monthNames[monthIndex]} ${startYear + year}`,
        newCustomers,
        totalCustomers,
        churnedCustomers,
        mrr,
        revenue,
        cogs,
        grossProfit,
        salesMarketing,
        rd,
        ga,
        headcount,
        headcountCost,
        totalOpex,
        operatingIncome,
        cashFlow,
        cashBalance,
      });
    }
    
    return months;
  }, [assumptions]);

  // Calculate annual summaries
  const annualData = useMemo((): AnnualData[] => {
    const years: AnnualData[] = [];
    const startYear = new Date().getFullYear();
    
    for (let y = 0; y < 5; y++) {
      const yearMonths = monthlyData.filter(m => m.year === startYear + y);
      if (yearMonths.length === 0) continue;
      
      const revenue = yearMonths.reduce((sum, m) => sum + m.revenue, 0);
      const cogs = yearMonths.reduce((sum, m) => sum + m.cogs, 0);
      const grossProfit = revenue - cogs;
      const salesMarketing = yearMonths.reduce((sum, m) => sum + m.salesMarketing, 0);
      const rd = yearMonths.reduce((sum, m) => sum + m.rd, 0);
      const ga = yearMonths.reduce((sum, m) => sum + m.ga, 0);
      const headcountCost = yearMonths.reduce((sum, m) => sum + m.headcountCost, 0);
      const totalOpex = salesMarketing + rd + ga + headcountCost;
      const operatingIncome = grossProfit - totalOpex;
      
      const operatingCashFlow = operatingIncome;
      const investingCashFlow = 0;
      const yearFunding = assumptions.fundingRounds
        .filter(f => Math.ceil(f.month / 12) === y + 1)
        .reduce((sum, f) => sum + f.amount, 0);
      const financingCashFlow = yearFunding;
      const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;
      const lastMonth = yearMonths[yearMonths.length - 1];
      
      years.push({
        year: startYear + y,
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue > 0 ? grossProfit / revenue : 0,
        salesMarketing,
        rd,
        ga,
        headcountCost,
        totalOpex,
        operatingIncome,
        operatingMargin: revenue > 0 ? operatingIncome / revenue : 0,
        netIncome: operatingIncome * 0.75, // Simplified tax
        operatingCashFlow,
        investingCashFlow,
        financingCashFlow,
        netCashChange,
        endingCash: lastMonth?.cashBalance || 0,
      });
    }
    
    return years;
  }, [monthlyData, assumptions.fundingRounds]);

  // Dashboard metrics
  const dashboardMetrics = useMemo(() => {
    const currentYear = annualData[0];
    const latestMonth = monthlyData[11] || monthlyData[monthlyData.length - 1];
    const burnRate = latestMonth ? Math.abs(Math.min(0, latestMonth.operatingIncome)) : 0;
    const runway = burnRate > 0 ? Math.round(latestMonth.cashBalance / burnRate) : 999;
    
    return {
      totalRevenue: currentYear?.revenue || 0,
      revenueGrowth: assumptions.revenueGrowthRates[0] * 100,
      burnRate,
      runway,
      grossMargin: currentYear?.grossMargin ? currentYear.grossMargin * 100 : 0,
      currentMRR: latestMonth?.mrr || 0,
      totalCustomers: latestMonth?.totalCustomers || 0,
      headcount: latestMonth?.headcount || 0,
    };
  }, [annualData, monthlyData, assumptions.revenueGrowthRates]);

  const resetToDefaults = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-20), assumptions]);
    setRedoStack([]);
    setAssumptions(defaultAssumptions);
  }, [assumptions]);

  return {
    assumptions,
    updateAssumption,
    monthlyData,
    annualData,
    dashboardMetrics,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    resetToDefaults,
  };
}

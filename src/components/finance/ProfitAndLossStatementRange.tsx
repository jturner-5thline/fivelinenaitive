import { TrendingUp } from "lucide-react";
import { FinancialStatementTableRange } from "./FinancialStatementTableRange";
import { FinancialPeriod, FinancialCategory, FinancialLineItem, FinancialDataEntry, FinancePeriodType, PeriodColumn } from "@/hooks/useFinanceDataRange";

interface ProfitAndLossStatementRangeProps {
  companyId: string;
  periodType: FinancePeriodType;
  periodColumns: PeriodColumn[];
  categories: FinancialCategory[];
  lineItems: FinancialLineItem[];
  financialData: FinancialDataEntry[];
  isLoading: boolean;
  onUpdateData: (periodId: string, lineItemId: string, amount: number, notes?: string) => Promise<boolean>;
  onCreatePeriod: (column: PeriodColumn) => Promise<FinancialPeriod | null>;
  onRefresh: () => Promise<void>;
}

export function ProfitAndLossStatementRange(props: ProfitAndLossStatementRangeProps) {
  return (
    <FinancialStatementTableRange
      title="Profit & Loss Statement"
      icon={<TrendingUp className="h-5 w-5 text-primary" />}
      {...props}
    />
  );
}

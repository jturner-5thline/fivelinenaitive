import { Wallet } from "lucide-react";
import { FinancialStatementTableRange } from "./FinancialStatementTableRange";
import { FinancialPeriod, FinancialCategory, FinancialLineItem, FinancialDataEntry, FinancePeriodType, PeriodColumn } from "@/hooks/useFinanceDataRange";

interface BalanceSheetStatementRangeProps {
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

export function BalanceSheetStatementRange(props: BalanceSheetStatementRangeProps) {
  return (
    <FinancialStatementTableRange
      title="Balance Sheet"
      icon={<Wallet className="h-5 w-5 text-primary" />}
      {...props}
    />
  );
}

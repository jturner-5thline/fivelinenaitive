import { ArrowDownUp } from "lucide-react";
import { FinancialStatementTableRange } from "./FinancialStatementTableRange";
import { FinancialPeriod, FinancialCategory, FinancialLineItem, FinancialDataEntry, FinancePeriodType, PeriodColumn } from "@/hooks/useFinanceDataRange";

interface CashFlowStatementRangeProps {
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

export function CashFlowStatementRange(props: CashFlowStatementRangeProps) {
  return (
    <FinancialStatementTableRange
      title="Cash Flow Statement"
      icon={<ArrowDownUp className="h-5 w-5 text-primary" />}
      {...props}
    />
  );
}

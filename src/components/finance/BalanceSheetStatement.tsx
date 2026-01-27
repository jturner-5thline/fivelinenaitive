import { Wallet } from "lucide-react";
import { FinancialStatementTable } from "./FinancialStatementTable";
import { FinancialPeriod, FinancialCategory, FinancialLineItem, FinancialDataEntry, FinancePeriodType } from "@/hooks/useFinanceData";

interface BalanceSheetStatementProps {
  companyId: string;
  periodType: FinancePeriodType;
  selectedYear: number;
  selectedMonth?: number;
  selectedQuarter?: number;
  periods: FinancialPeriod[];
  categories: FinancialCategory[];
  lineItems: FinancialLineItem[];
  financialData: FinancialDataEntry[];
  isLoading: boolean;
  onUpdateData: (periodId: string, lineItemId: string, amount: number, notes?: string) => Promise<boolean>;
  onCreatePeriod: () => Promise<FinancialPeriod | null>;
  onRefresh: () => Promise<void>;
}

export function BalanceSheetStatement(props: BalanceSheetStatementProps) {
  return (
    <FinancialStatementTable
      title="Balance Sheet"
      icon={<Wallet className="h-5 w-5 text-primary" />}
      {...props}
    />
  );
}

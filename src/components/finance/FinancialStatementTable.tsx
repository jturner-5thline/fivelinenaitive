import { useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, TrendingUp, TrendingDown, Minus, Save, Loader2 } from "lucide-react";
import { FinancialPeriod, FinancialCategory, FinancialLineItem, FinancialDataEntry, FinancePeriodType } from "@/hooks/useFinanceData";
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from "@/utils/currencyFormat";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface FinancialStatementTableProps {
  title: string;
  icon: React.ReactNode;
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

export function FinancialStatementTable({
  title,
  icon,
  companyId,
  periodType,
  selectedYear,
  selectedMonth,
  selectedQuarter,
  periods,
  categories,
  lineItems,
  financialData,
  isLoading,
  onUpdateData,
  onCreatePeriod,
  onRefresh,
}: FinancialStatementTableProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const currentPeriod = periods[0];
  const previousPeriod = periods[1];

  const getDataForCell = useCallback((periodId: string, lineItemId: string) => {
    return financialData.find(
      d => d.period_id === periodId && d.line_item_id === lineItemId
    );
  }, [financialData]);

  const getChangeIndicator = (currentAmount: number, previousAmount: number | undefined) => {
    if (previousAmount === undefined || previousAmount === 0) return null;
    const change = ((currentAmount - previousAmount) / Math.abs(previousAmount)) * 100;
    
    if (Math.abs(change) < 0.01) {
      return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
    if (change > 0) {
      return (
        <div className="flex items-center gap-1 text-success text-xs">
          <TrendingUp className="h-3 w-3" />
          <span>+{change.toFixed(1)}%</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-destructive text-xs">
        <TrendingDown className="h-3 w-3" />
        <span>{change.toFixed(1)}%</span>
      </div>
    );
  };

  const handleStartEdit = (periodId: string, lineItemId: string, currentValue: number) => {
    const key = `${periodId}-${lineItemId}`;
    setEditingCell(key);
    setEditValue(formatCurrencyInputValue(currentValue));
  };

  const handleSave = async (periodId: string, lineItemId: string) => {
    const key = `${periodId}-${lineItemId}`;
    setSavingCell(key);
    
    const numericValue = parseCurrencyInputValue(editValue) || 0;
    const success = await onUpdateData(periodId, lineItemId, numericValue);
    
    if (success) {
      setEditingCell(null);
    }
    setSavingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, periodId: string, lineItemId: string) => {
    if (e.key === 'Enter') {
      handleSave(periodId, lineItemId);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleCreatePeriod = async () => {
    await onCreatePeriod();
  };

  const getPeriodLabel = () => {
    if (periodType === 'monthly' && selectedMonth) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[selectedMonth - 1]} ${selectedYear}`;
    } else if (periodType === 'quarterly' && selectedQuarter) {
      return `Q${selectedQuarter} ${selectedYear}`;
    }
    return `FY ${selectedYear}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedLineItems = categories.map(category => ({
    category,
    items: lineItems.filter(li => li.category_id === category.id)
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
          <Badge variant="outline">{getPeriodLabel()}</Badge>
        </div>
        {!currentPeriod && (
          <Button onClick={handleCreatePeriod} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create Period
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!currentPeriod ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No data for this period yet.</p>
            <p className="text-sm mt-1">Create a period to start entering data.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Line Item</TableHead>
                  <TableHead className="text-right">Current Period</TableHead>
                  {previousPeriod && (
                    <>
                      <TableHead className="text-right">Previous Period</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedLineItems.map(({ category, items }) => (
                  <>
                    <TableRow key={category.id} className="bg-muted/30">
                      <TableCell colSpan={previousPeriod ? 4 : 2} className="font-semibold">
                        {category.name}
                      </TableCell>
                    </TableRow>
                    {items.length === 0 && (
                      <TableRow key={`${category.id}-empty`}>
                        <TableCell colSpan={previousPeriod ? 4 : 2} className="text-muted-foreground text-sm italic pl-8">
                          No line items in this category
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map(item => {
                      const currentData = getDataForCell(currentPeriod.id, item.id);
                      const previousData = previousPeriod ? getDataForCell(previousPeriod.id, item.id) : undefined;
                      const cellKey = `${currentPeriod.id}-${item.id}`;
                      const isEditing = editingCell === cellKey;
                      const isSaving = savingCell === cellKey;
                      const currentAmount = currentData?.amount ?? 0;
                      const previousAmount = previousData?.amount;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="pl-8">{item.name}</TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                  <Input
                                    value={editValue}
                                    onChange={(e) => setEditValue(formatAmountWithCommas(e.target.value))}
                                    onKeyDown={(e) => handleKeyDown(e, currentPeriod.id, item.id)}
                                    className="w-32 pl-7 text-right"
                                    autoFocus
                                  />
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => handleSave(currentPeriod.id, item.id)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <button
                                className={cn(
                                  "px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer",
                                  currentAmount < 0 && "text-destructive"
                                )}
                                onClick={() => handleStartEdit(currentPeriod.id, item.id, currentAmount)}
                              >
                                ${formatCurrencyInputValue(currentAmount)}
                              </button>
                            )}
                          </TableCell>
                          {previousPeriod && (
                            <>
                              <TableCell className={cn("text-right text-muted-foreground", previousAmount !== undefined && previousAmount < 0 && "text-destructive")}>
                                {previousAmount !== undefined ? `$${formatCurrencyInputValue(previousAmount)}` : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {getChangeIndicator(currentAmount, previousAmount)}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

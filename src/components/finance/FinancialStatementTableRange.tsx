import React, { useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Save, Loader2 } from "lucide-react";
import { FinancialCategory, FinancialLineItem, FinancialDataEntry, PeriodColumn, FinancePeriodType, FinancialPeriod } from "@/hooks/useFinanceDataRange";
import { formatCurrencyInputValue, parseCurrencyInputValue, formatAmountWithCommas } from "@/utils/currencyFormat";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FinancialStatementTableRangeProps {
  title: string;
  icon: React.ReactNode;
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

export function FinancialStatementTableRange({
  title,
  icon,
  companyId,
  periodType,
  periodColumns,
  categories,
  lineItems,
  financialData,
  isLoading,
  onUpdateData,
  onCreatePeriod,
  onRefresh,
}: FinancialStatementTableRangeProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [creatingPeriod, setCreatingPeriod] = useState<string | null>(null);

  const getDataForCell = useCallback((periodId: string | undefined, lineItemId: string) => {
    if (!periodId) return undefined;
    return financialData.find(
      d => d.period_id === periodId && d.line_item_id === lineItemId
    );
  }, [financialData]);

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

  const handleCreatePeriod = async (column: PeriodColumn) => {
    setCreatingPeriod(column.label);
    await onCreatePeriod(column);
    setCreatingPeriod(null);
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
      <CardHeader className="flex flex-row items-center gap-2">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {periodColumns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No periods in selected date range.</p>
            <p className="text-sm mt-1">Adjust the date range to view financial data.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px] min-w-[200px] sticky left-0 bg-background z-10">Line Item</TableHead>
                  {periodColumns.map(col => (
                    <TableHead key={col.label} className="text-right min-w-[120px]">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{col.shortLabel}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{col.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedLineItems.map(({ category, items }) => (
                  <React.Fragment key={category.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={periodColumns.length + 1} className="font-semibold sticky left-0 bg-muted/30 z-10">
                        {category.name}
                      </TableCell>
                    </TableRow>
                    {items.length === 0 && (
                      <TableRow key={`${category.id}-empty`}>
                        <TableCell colSpan={periodColumns.length + 1} className="text-muted-foreground text-sm italic pl-8">
                          No line items in this category
                        </TableCell>
                      </TableRow>
                    )}
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="pl-8 sticky left-0 bg-background z-10">{item.name}</TableCell>
                        {periodColumns.map(col => {
                          const period = col.period;
                          
                          if (!period) {
                            return (
                              <TableCell key={col.label} className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleCreatePeriod(col)}
                                  disabled={creatingPeriod === col.label}
                                >
                                  {creatingPeriod === col.label ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3" />
                                  )}
                                </Button>
                              </TableCell>
                            );
                          }

                          const data = getDataForCell(period.id, item.id);
                          const cellKey = `${period.id}-${item.id}`;
                          const isEditing = editingCell === cellKey;
                          const isSaving = savingCell === cellKey;
                          const currentAmount = data?.amount ?? 0;

                          return (
                            <TableCell key={col.label} className="text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                    <Input
                                      value={editValue}
                                      onChange={(e) => setEditValue(formatAmountWithCommas(e.target.value))}
                                      onKeyDown={(e) => handleKeyDown(e, period.id, item.id)}
                                      className="w-24 pl-5 text-right text-sm h-8"
                                      autoFocus
                                    />
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => handleSave(period.id, item.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  className={cn(
                                    "px-2 py-1 rounded hover:bg-muted/50 transition-colors cursor-pointer text-sm",
                                    currentAmount < 0 && "text-destructive"
                                  )}
                                  onClick={() => handleStartEdit(period.id, item.id, currentAmount)}
                                >
                                  ${formatCurrencyInputValue(currentAmount)}
                                </button>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

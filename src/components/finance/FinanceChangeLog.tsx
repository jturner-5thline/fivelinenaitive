import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown } from "lucide-react";
import { FinancialChangeLog as ChangeLogType, FinancialLineItem, FinancialPeriod } from "@/hooks/useFinanceData";
import { formatCurrencyInputValue } from "@/utils/currencyFormat";
import { Skeleton } from "@/components/ui/skeleton";

interface FinanceChangeLogProps {
  changeLogs: ChangeLogType[];
  lineItems: FinancialLineItem[];
  periods: FinancialPeriod[];
  isLoading: boolean;
}

export function FinanceChangeLog({ changeLogs, lineItems, periods, isLoading }: FinanceChangeLogProps) {
  const getLineItemName = (lineItemId: string) => {
    const item = lineItems.find(li => li.id === lineItemId);
    return item?.name || 'Unknown';
  };

  const getPeriodLabel = (periodId: string) => {
    const period = periods.find(p => p.id === periodId);
    if (!period) return 'Unknown';
    
    if (period.period_type === 'monthly' && period.month) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[period.month - 1]} ${period.year}`;
    } else if (period.period_type === 'quarterly' && period.quarter) {
      return `Q${period.quarter} ${period.year}`;
    }
    return `FY ${period.year}`;
  };

  const getChangeDirection = (prev: number | null, current: number) => {
    if (prev === null) return null;
    if (current > prev) return 'up';
    if (current < prev) return 'down';
    return null;
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
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <CardTitle>Change History</CardTitle>
        <Badge variant="outline" className="ml-auto">
          {changeLogs.length} changes
        </Badge>
      </CardHeader>
      <CardContent>
        {changeLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No changes recorded yet.</p>
            <p className="text-sm mt-1">Changes will appear here when you update financial data.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Line Item</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changeLogs.map((log) => {
                  const direction = getChangeDirection(log.previous_amount, log.new_amount);
                  const changeAmount = log.previous_amount !== null 
                    ? log.new_amount - log.previous_amount 
                    : log.new_amount;
                  
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(log.changed_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getPeriodLabel(log.period_id)}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getLineItemName(log.line_item_id)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {log.previous_amount !== null 
                          ? `$${formatCurrencyInputValue(log.previous_amount)}`
                          : '—'
                        }
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${formatCurrencyInputValue(log.new_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {direction === 'up' && (
                            <TrendingUp className="h-4 w-4 text-success" />
                          )}
                          {direction === 'down' && (
                            <TrendingDown className="h-4 w-4 text-destructive" />
                          )}
                          <span className={
                            direction === 'up' 
                              ? 'text-success' 
                              : direction === 'down' 
                                ? 'text-destructive' 
                                : ''
                          }>
                            {changeAmount >= 0 ? '+' : ''}${formatCurrencyInputValue(changeAmount)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

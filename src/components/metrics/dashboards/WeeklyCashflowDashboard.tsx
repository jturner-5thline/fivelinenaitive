import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function NoPermissionCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Lock className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm font-medium">No Permission</p>
        <p className="text-xs">You do not have permission to view the data</p>
        <Button variant="default" size="sm" className="mt-3">Request Permission</Button>
      </CardContent>
    </Card>
  );
}

export function WeeklyCashflowDashboard() {
  const cashSummary = {
    cashReceipts: 232900,
    cashOut: -253000,
    netChange: -20100,
  };

  const upcomingItems = [
    { item: 'Gabb Retainer', amount: '$23.0K', date: 'Tuesday, December 16, 2025' },
    { item: 'OpConnect Milestone', amount: '$45.0K', date: 'Friday, November 28, 2025' },
    { item: 'SNA Closing', amount: '$75.0K', date: 'Wednesday, November 26, 2025' },
    { item: 'BBP', amount: '$17.5K', date: 'Friday, November 7, 2025' },
    { item: 'Breaktime Closing', amount: '$10.0K', date: 'Friday, November 14, 2025' },
    { item: 'PBI Closing', amount: '$92.5K', date: 'Friday, January 30, 2026' },
  ];

  const notes = [
    '1. 5LFS - $85k invoices paid',
    '2. 5LCA - $148k revenue',
  ];

  const formatCurrency = (value: number) => {
    const prefix = value < 0 ? '-' : '';
    const absValue = Math.abs(value);
    if (absValue >= 1000) return `${prefix}$${(absValue / 1000).toFixed(1)}K`;
    return `${prefix}$${absValue.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Row: Forecast & Comments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoPermissionCard title="Forecast" />
        <NoPermissionCard title="Comments" />
      </div>

      {/* Second Row: Due Next 9 weeks & Management Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoPermissionCard title="Due Next 9 weeks" />
        <NoPermissionCard title="Management Snapshot" />
      </div>

      {/* Bottom Row: Notes, Next 8 Weeks, Cash In/Out */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {notes.map((note, idx) => (
                <li key={idx} className="text-muted-foreground">{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Next 8 Weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Cash Receipts</p>
                  <p className="font-semibold text-success">{formatCurrency(cashSummary.cashReceipts)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">(Cash-Out)</p>
                  <p className="font-semibold text-destructive">{formatCurrency(cashSummary.cashOut)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Net Change in Cash</p>
                  <p className="font-semibold text-destructive">{formatCurrency(cashSummary.netChange)}</p>
                </div>
              </div>
              <Table>
                <TableBody>
                  {upcomingItems.map((item) => (
                    <TableRow key={item.item}>
                      <TableCell className="text-xs py-1">{item.item}</TableCell>
                      <TableCell className="text-xs py-1 text-right font-medium">{item.amount}</TableCell>
                      <TableCell className="text-xs py-1 text-right text-muted-foreground">{item.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash In | Cash Out</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">Chart visualization</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

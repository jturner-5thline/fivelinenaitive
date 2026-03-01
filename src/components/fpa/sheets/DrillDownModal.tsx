import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Download, ArrowUpDown, ChevronLeft } from 'lucide-react';

interface DrillDownRecord {
  id: string;
  date: string;
  account: string;
  accountNumber: string;
  vendor: string;
  department: string;
  location: string;
  amount: number;
  description: string;
}

const DEMO_RECORDS: DrillDownRecord[] = [
  { id: '1', date: '2025-01-15', account: 'Product Sales', accountNumber: '4010', vendor: 'FreshPath Consulting', department: 'Sales', location: 'United States', amount: 68200, description: 'Q1 consulting engagement' },
  { id: '2', date: '2025-01-12', account: 'Product Sales', accountNumber: '4010', vendor: 'Catalyst Growth Partners', department: 'Sales', location: 'United States', amount: -176000, description: 'Contract adjustment' },
  { id: '3', date: '2025-01-10', account: 'Product Sales', accountNumber: '4010', vendor: 'Delta Strategic Solutions', department: 'Sales', location: 'Canada', amount: -91000, description: 'Scope reduction' },
  { id: '4', date: '2025-01-08', account: 'Service Revenue', accountNumber: '4020', vendor: 'Apex Digital Inc', department: 'Professional Services', location: 'United States', amount: 45000, description: 'Monthly retainer' },
  { id: '5', date: '2025-01-05', account: 'Service Revenue', accountNumber: '4020', vendor: 'NovaWave Technologies', department: 'Professional Services', location: 'United Kingdom', amount: 32500, description: 'Implementation services' },
  { id: '6', date: '2025-01-03', account: 'Subscription Revenue', accountNumber: '4030', vendor: 'MultiCloud Corp', department: 'Product', location: 'United States', amount: 125000, description: 'Annual renewal' },
  { id: '7', date: '2025-01-02', account: 'Subscription Revenue', accountNumber: '4030', vendor: 'TechForward Inc', department: 'Product', location: 'Germany', amount: -37200, description: 'Churn - retired activities' },
  { id: '8', date: '2025-01-01', account: 'Other Revenue', accountNumber: '4090', vendor: 'Summit Partners', department: 'Finance', location: 'United States', amount: 15000, description: 'Referral fee' },
];

interface DrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cellLabel?: string;
  cellValue?: number;
}

export function DrillDownModal({ open, onOpenChange, cellLabel = 'Revenue', cellValue = 95000000 }: DrillDownModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof DrillDownRecord>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredRecords = DEMO_RECORDS.filter(r =>
    Object.values(r).some(v =>
      String(v).toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const cmp = typeof aVal === 'number'
      ? (aVal as number) - (bVal as number)
      : String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalAmount = sortedRecords.reduce((sum, r) => sum + r.amount, 0);

  const handleSort = (field: keyof DrillDownRecord) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const headers: { key: keyof DrillDownRecord; label: string; align?: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'account', label: 'Account' },
    { key: 'accountNumber', label: 'Acct #' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'amount', label: 'Amount', align: 'right' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenChange(false)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <DialogTitle className="text-sm">
              Drill Down: {cellLabel}
            </DialogTitle>
            <Badge variant="secondary" className="text-[10px]">
              {sortedRecords.length} records
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Filter records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7"
              />
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <Download className="h-3 w-3" /> Export
            </Button>
          </div>

          {/* Table */}
          <ScrollArea className="h-[400px] border border-border rounded-md">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {headers.map((h) => (
                    <th
                      key={h.key}
                      className={`px-2 py-1.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground ${h.align === 'right' ? 'text-right' : 'text-left'}`}
                      onClick={() => handleSort(h.key)}
                    >
                      <div className={`flex items-center gap-0.5 ${h.align === 'right' ? 'justify-end' : ''}`}>
                        {h.label}
                        {sortField === h.key && (
                          <ArrowUpDown className="h-2.5 w-2.5" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map((record) => (
                  <tr key={record.id} className="border-t border-border/30 hover:bg-accent/30">
                    <td className="px-2 py-1.5 text-muted-foreground">{record.date}</td>
                    <td className="px-2 py-1.5 font-medium">{record.account}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{record.accountNumber}</td>
                    <td className="px-2 py-1.5">{record.vendor}</td>
                    <td className="px-2 py-1.5">{record.department}</td>
                    <td className="px-2 py-1.5">{record.location}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${record.amount < 0 ? 'text-destructive' : ''}`}>
                      {record.amount < 0 ? '−' : ''}${Math.abs(record.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t-2 border-border bg-muted/30 font-medium">
                  <td colSpan={6} className="px-2 py-1.5">Total</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${totalAmount < 0 ? 'text-destructive' : ''}`}>
                    {totalAmount < 0 ? '−' : ''}${Math.abs(totalAmount).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </ScrollArea>

          {/* Source info */}
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>Source: QuickBooks → Income Statement · Last synced 2 min ago</span>
            <span>Showing {sortedRecords.length} of {DEMO_RECORDS.length} records</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

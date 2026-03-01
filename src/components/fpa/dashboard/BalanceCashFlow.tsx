import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Download, Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Line, ComposedChart, Cell
} from 'recharts';

const tooltipStyle = { fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 };

// Balance Sheet data
const BALANCE_SHEET = [
  { account: 'Total Assets', value: 45200, priorQ: 42800, isHeader: true },
  { account: '  Cash & Equivalents', value: 18500, priorQ: 17200, isHeader: false },
  { account: '  Accounts Receivable', value: 8200, priorQ: 7800, isHeader: false },
  { account: '  Prepaid & Other Current', value: 2100, priorQ: 1900, isHeader: false },
  { account: '  PP&E (net)', value: 6400, priorQ: 6500, isHeader: false },
  { account: '  Intangibles & Goodwill', value: 8000, priorQ: 8000, isHeader: false },
  { account: '  Other Non-Current', value: 2000, priorQ: 1400, isHeader: false },
  { account: 'Total Liabilities', value: 22100, priorQ: 21500, isHeader: true },
  { account: '  Accounts Payable', value: 3200, priorQ: 3000, isHeader: false },
  { account: '  Accrued Expenses', value: 4500, priorQ: 4200, isHeader: false },
  { account: '  Deferred Revenue', value: 6800, priorQ: 6500, isHeader: false },
  { account: '  Long-term Debt', value: 5600, priorQ: 5800, isHeader: false },
  { account: '  Other Liabilities', value: 2000, priorQ: 2000, isHeader: false },
  { account: 'Total Equity', value: 23100, priorQ: 21300, isHeader: true },
];

// Cash Flow waterfall
const CASH_FLOW = [
  { name: 'Opening Cash', value: 17200, fill: 'hsl(var(--muted-foreground))' },
  { name: 'Operating CF', value: 2800, fill: 'hsl(var(--chart-2))' },
  { name: 'CapEx', value: -400, fill: 'hsl(var(--destructive))' },
  { name: 'Debt Repayment', value: -200, fill: 'hsl(var(--chart-5))' },
  { name: 'Financing', value: 0, fill: 'hsl(var(--chart-4))' },
  { name: 'Working Capital', value: -900, fill: 'hsl(var(--destructive))' },
  { name: 'Closing Cash', value: 18500, fill: 'hsl(var(--primary))' },
];

// Cash trend
const CASH_TREND = [
  { month: 'Jul', cash: 14200, fcf: 800, burnRate: 350 },
  { month: 'Aug', cash: 14800, fcf: 850, burnRate: 340 },
  { month: 'Sep', cash: 15400, fcf: 900, burnRate: 330 },
  { month: 'Oct', cash: 16000, fcf: 950, burnRate: 325 },
  { month: 'Nov', cash: 16600, fcf: 900, burnRate: 330 },
  { month: 'Dec', cash: 17200, fcf: 1000, burnRate: 320 },
  { month: 'Jan', cash: 17800, fcf: 1050, burnRate: 315 },
  { month: 'Feb', cash: 18500, fcf: 1100, burnRate: 310 },
];

const fmt = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}M`;
  return `${v < 0 ? '-' : ''}$${abs}K`;
};

interface BalanceCashFlowProps {
  view: 'balance' | 'cashflow';
}

export function BalanceCashFlow({ view }: BalanceCashFlowProps) {
  if (view === 'balance') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Balance Sheet</CardTitle>
              <Badge variant="outline" className="text-[9px]">Feb 2026 · $K</Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Account</TableHead>
                <TableHead className="text-[10px] text-right">Current</TableHead>
                <TableHead className="text-[10px] text-right">Prior Quarter</TableHead>
                <TableHead className="text-[10px] text-right">Δ ($K)</TableHead>
                <TableHead className="text-[10px] text-right">Δ (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BALANCE_SHEET.map((row, i) => {
                const change = row.value - row.priorQ;
                const changePct = row.priorQ !== 0 ? (change / Math.abs(row.priorQ)) * 100 : 0;
                return (
                  <TableRow key={i} className={cn(row.isHeader && "bg-muted/30 font-semibold")}>
                    <TableCell className={cn("text-xs py-1.5", !row.isHeader && "pl-6")}>{row.account.trim()}</TableCell>
                    <TableCell className={cn("text-xs text-right font-mono py-1.5", row.isHeader && "font-semibold")}>{fmt(row.value)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground py-1.5">{fmt(row.priorQ)}</TableCell>
                    <TableCell className={cn("text-xs text-right font-mono py-1.5", change > 0 ? "text-emerald-600" : change < 0 ? "text-destructive" : "")}>
                      {change === 0 ? '—' : `${change > 0 ? '+' : ''}${fmt(change)}`}
                    </TableCell>
                    <TableCell className={cn("text-xs text-right font-mono py-1.5", changePct > 0 ? "text-emerald-600" : changePct < 0 ? "text-destructive" : "")}>
                      {changePct === 0 ? '—' : `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // Cash Flow view
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cash Flow Waterfall */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Flow Bridge — Feb 2026</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={CASH_FLOW}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} domain={[0, 20000]} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {CASH_FLOW.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cash & FCF Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Position & Free Cash Flow</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={CASH_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}K`} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar yAxisId="right" dataKey="fcf" fill="hsl(var(--chart-2))" opacity={0.6} barSize={20} radius={[3, 3, 0, 0]} name="FCF" />
                <Line yAxisId="left" type="monotone" dataKey="cash" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Cash" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

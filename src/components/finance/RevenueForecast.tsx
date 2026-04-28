import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, DollarSign, Users, Package, Plus, Trash2,
  ArrowUpRight, ArrowDownRight, Calculator, Target, Fuel
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from "recharts";

interface RevenueStream {
  id: string;
  name: string;
  type: 'recurring' | 'one-time' | 'usage';
  currentMRR: number;
  growthRate: number;
  churnRate: number;
  newCustomersPerMonth: number;
  avgRevenuePerCustomer: number;
}

interface ExpenseCategory {
  id: string;
  name: string;
  type: 'fixed' | 'variable' | 'headcount';
  currentMonthly: number;
  growthRate: number;
  percentOfRevenue?: number;
  headcount?: number;
  costPerHead?: number;
  hiresPlan?: number[];
}

const defaultStreams: RevenueStream[] = [
  { id: '1', name: 'SaaS Subscriptions', type: 'recurring', currentMRR: 80000, growthRate: 8, churnRate: 2, newCustomersPerMonth: 5, avgRevenuePerCustomer: 2000 },
  { id: '2', name: 'Professional Services', type: 'one-time', currentMRR: 20000, growthRate: 5, churnRate: 0, newCustomersPerMonth: 2, avgRevenuePerCustomer: 10000 },
];

const defaultExpenses: ExpenseCategory[] = [
  { id: 'e1', name: 'Salaries & Benefits', type: 'headcount', currentMonthly: 60000, growthRate: 3, headcount: 12, costPerHead: 5000 },
  { id: 'e2', name: 'Office & Rent', type: 'fixed', currentMonthly: 8000, growthRate: 2 },
  { id: 'e3', name: 'COGS / Hosting', type: 'variable', currentMonthly: 15000, growthRate: 0, percentOfRevenue: 15 },
  { id: 'e4', name: 'Sales & Marketing', type: 'variable', currentMonthly: 12000, growthRate: 0, percentOfRevenue: 12 },
  { id: 'e5', name: 'G&A', type: 'fixed', currentMonthly: 5000, growthRate: 3 },
];

const formatCurrency = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function RevenueForecast({ className }: { className?: string }) {
  const [streams, setStreams] = useState<RevenueStream[]>(defaultStreams);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>(defaultExpenses);
  const [forecastMonths, setForecastMonths] = useState(12);
  const [tab, setTab] = useState('revenue');

  const projections = useMemo(() => {
    const data: { month: string; revenue: number; expenses: number; netIncome: number; cashBalance: number; [key: string]: any }[] = [];
    let cashBalance = 100000;

    for (let m = 0; m < forecastMonths; m++) {
      const monthLabel = months[m % 12];
      let totalRevenue = 0;

      streams.forEach(s => {
        const monthlyGrowth = s.growthRate / 100;
        const monthlyChurn = s.churnRate / 100;
        const netGrowth = monthlyGrowth - monthlyChurn;
        const rev = s.currentMRR * Math.pow(1 + netGrowth, m) + (s.newCustomersPerMonth * m * s.avgRevenuePerCustomer * 0.1);
        totalRevenue += rev;
      });

      let totalExpenses = 0;
      expenses.forEach(e => {
        let exp: number;
        if (e.type === 'variable' && e.percentOfRevenue) {
          exp = totalRevenue * (e.percentOfRevenue / 100);
        } else if (e.type === 'headcount') {
          const heads = (e.headcount || 0) + Math.floor(m / 3);
          exp = heads * (e.costPerHead || 0);
        } else {
          exp = e.currentMonthly * Math.pow(1 + (e.growthRate / 100) / 12, m);
        }
        totalExpenses += exp;
      });

      const netIncome = totalRevenue - totalExpenses;
      cashBalance += netIncome;

      data.push({
        month: `M${m + 1}`,
        monthLabel,
        revenue: Math.round(totalRevenue),
        expenses: Math.round(totalExpenses),
        netIncome: Math.round(netIncome),
        cashBalance: Math.round(cashBalance),
      });
    }
    return data;
  }, [streams, expenses, forecastMonths]);

  const annualTotals = useMemo(() => ({
    revenue: projections.reduce((s, p) => s + p.revenue, 0),
    expenses: projections.reduce((s, p) => s + p.expenses, 0),
    netIncome: projections.reduce((s, p) => s + p.netIncome, 0),
    endCash: projections[projections.length - 1]?.cashBalance || 0,
  }), [projections]);

  const burnRate = useMemo(() => {
    const avgMonthlyBurn = projections.filter(p => p.netIncome < 0).reduce((s, p) => s + Math.abs(p.netIncome), 0) / Math.max(projections.filter(p => p.netIncome < 0).length, 1);
    const runway = avgMonthlyBurn > 0 ? Math.round(annualTotals.endCash / avgMonthlyBurn) : Infinity;
    return { avgMonthlyBurn, runway };
  }, [projections, annualTotals]);

  const addStream = () => setStreams(prev => [...prev, {
    id: `s-${Date.now()}`, name: 'New Stream', type: 'recurring',
    currentMRR: 0, growthRate: 5, churnRate: 1, newCustomersPerMonth: 2, avgRevenuePerCustomer: 1000,
  }]);

  const addExpense = () => setExpenses(prev => [...prev, {
    id: `e-${Date.now()}`, name: 'New Expense', type: 'fixed', currentMonthly: 0, growthRate: 3,
  }]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Projected Revenue', value: formatCurrency(annualTotals.revenue), icon: <DollarSign className="h-4 w-4" />, trend: 'up' },
          { label: 'Projected Expenses', value: formatCurrency(annualTotals.expenses), icon: <ArrowDownRight className="h-4 w-4" />, trend: 'down' },
          { label: 'Net Income', value: formatCurrency(annualTotals.netIncome), icon: <TrendingUp className="h-4 w-4" />, trend: annualTotals.netIncome > 0 ? 'up' : 'down' },
          { label: 'Cash Runway', value: burnRate.runway === Infinity ? '∞' : `${burnRate.runway} mo`, icon: <Fuel className="h-4 w-4" />, trend: burnRate.runway > 12 ? 'up' : 'down' },
        ].map((kpi, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-muted-foreground", kpi.trend === 'up' ? 'text-success' : 'text-destructive')}>{kpi.icon}</span>
                {kpi.trend === 'up' ? <ArrowUpRight className="h-3 w-3 text-success" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
              </div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-lg font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Revenue & Expense Forecast</CardTitle>
            <Select value={forecastMonths.toString()} onValueChange={v => setForecastMonths(parseInt(v))}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
                <SelectItem value="24">24 Months</SelectItem>
                <SelectItem value="36">36 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projections}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <ReTooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" fill="hsl(var(--success) / 0.2)" stroke="hsl(var(--success))" strokeWidth={1} />
                <Area type="monotone" dataKey="expenses" name="Expenses" fill="hsl(var(--destructive) / 0.2)" stroke="hsl(var(--destructive))" strokeWidth={1} />
                <Line type="monotone" dataKey="cashBalance" name="Cash Balance" stroke="hsl(var(--primary))" strokeWidth={1} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Revenue & Expense Inputs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="revenue" className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />Revenue Streams
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5" />Expenses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Revenue Streams</CardTitle>
                <Button variant="outline" size="sm" onClick={addStream}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stream</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Current MRR</TableHead>
                    <TableHead className="text-right">Growth %</TableHead>
                    <TableHead className="text-right">Churn %</TableHead>
                    <TableHead className="text-right">New/mo</TableHead>
                    <TableHead className="text-right">ARPC</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Input value={s.name} onChange={e => setStreams(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} className="h-7 text-xs w-36" />
                      </TableCell>
                      <TableCell>
                        <Select value={s.type} onValueChange={v => setStreams(prev => prev.map(x => x.id === s.id ? { ...x, type: v as any } : x))}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="recurring">Recurring</SelectItem>
                            <SelectItem value="one-time">One-time</SelectItem>
                            <SelectItem value="usage">Usage</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {(['currentMRR', 'growthRate', 'churnRate', 'newCustomersPerMonth', 'avgRevenuePerCustomer'] as const).map(field => (
                        <TableCell key={field} className="text-right">
                          <Input type="number" value={s[field]} onChange={e => setStreams(prev => prev.map(x => x.id === s.id ? { ...x, [field]: parseFloat(e.target.value) || 0 } : x))} className="h-7 text-xs text-right w-20" />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setStreams(prev => prev.filter(x => x.id !== s.id))} className="h-7 w-7 p-0 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Expense Categories</CardTitle>
                <Button variant="outline" size="sm" onClick={addExpense}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Monthly $</TableHead>
                    <TableHead className="text-right">Growth %</TableHead>
                    <TableHead className="text-right">% of Rev</TableHead>
                    <TableHead className="text-right">Headcount</TableHead>
                    <TableHead className="text-right">$/Head</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Input value={e.name} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, name: ev.target.value } : x))} className="h-7 text-xs w-36" />
                      </TableCell>
                      <TableCell>
                        <Select value={e.type} onValueChange={v => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, type: v as any } : x))}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="variable">Variable</SelectItem>
                            <SelectItem value="headcount">Headcount</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={e.currentMonthly} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, currentMonthly: parseFloat(ev.target.value) || 0 } : x))} className="h-7 text-xs text-right w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={e.growthRate} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, growthRate: parseFloat(ev.target.value) || 0 } : x))} className="h-7 text-xs text-right w-16" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={e.percentOfRevenue || ''} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, percentOfRevenue: parseFloat(ev.target.value) || 0 } : x))} className="h-7 text-xs text-right w-16" disabled={e.type !== 'variable'} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={e.headcount || ''} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, headcount: parseInt(ev.target.value) || 0 } : x))} className="h-7 text-xs text-right w-16" disabled={e.type !== 'headcount'} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={e.costPerHead || ''} onChange={ev => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, costPerHead: parseFloat(ev.target.value) || 0 } : x))} className="h-7 text-xs text-right w-16" disabled={e.type !== 'headcount'} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setExpenses(prev => prev.filter(x => x.id !== e.id))} className="h-7 w-7 p-0 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Monthly Projection Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Monthly Projections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10">Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">Cash Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projections.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium text-xs">{p.month}</TableCell>
                    <TableCell className="text-right text-xs font-mono text-success">{formatCurrency(p.revenue)}</TableCell>
                    <TableCell className="text-right text-xs font-mono text-destructive">{formatCurrency(p.expenses)}</TableCell>
                    <TableCell className={cn("text-right text-xs font-mono", p.netIncome >= 0 ? "text-success" : "text-destructive")}>
                      {formatCurrency(p.netIncome)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">{formatCurrency(p.cashBalance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-card z-10">Total</TableCell>
                  <TableCell className="text-right text-xs font-mono text-success">{formatCurrency(annualTotals.revenue)}</TableCell>
                  <TableCell className="text-right text-xs font-mono text-destructive">{formatCurrency(annualTotals.expenses)}</TableCell>
                  <TableCell className={cn("text-right text-xs font-mono", annualTotals.netIncome >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(annualTotals.netIncome)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(annualTotals.endCash)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

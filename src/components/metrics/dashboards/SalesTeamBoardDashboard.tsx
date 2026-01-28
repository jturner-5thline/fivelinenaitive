import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ComposedChart, Line, CartesianGrid } from 'recharts';
import { useMetricsData } from '@/hooks/useMetricsData';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

function MetricStatCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function SalesTeamBoardDashboard() {
  const { data: metrics, isLoading } = useMetricsData();

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  const yoyChangeData = [
    { metric: 'Deals on Board', q1: '-54%', q2: '-28%', q3: '-14%', q4: '-29%' },
    { metric: 'Proposals Issued #', q1: '0%', q2: '-20%', q3: '9%', q4: '8%' },
    { metric: 'Clients Signed', q1: '167%', q2: '-50%', q3: '50%', q4: '26%' },
    { metric: 'Clients Receiving Terms', q1: '800%', q2: '133%', q3: '-33%', q4: '115%' },
    { metric: 'Terms Signed', q1: '800%', q2: '100%', q3: '0%', q4: '271%' },
    { metric: 'Deals Closed', q1: '100%', q2: '100%', q3: '100%', q4: '100%' },
    { metric: 'Dollars on Board', q1: '-81%', q2: '-68%', q3: '34%', q4: '-53%' },
    { metric: 'Dollars Proposed', q1: '-47%', q2: '-76%', q3: '-6%', q4: '-53%' },
    { metric: 'Dollars Signed', q1: '-20%', q2: '-71%', q3: '-29%', q4: '-55%' },
    { metric: 'Volume of Terms Signed', q1: '415%', q2: '100%', q3: '-49%', q4: '130%' },
    { metric: 'Dollars Funded', q1: '526%', q2: '100%', q3: '100%', q4: '2051%' },
    { metric: 'Retainer Revenue', q1: '100%', q2: '-32%', q3: '-26%', q4: '81%' },
    { metric: 'Consulting / Milestone Revenue', q1: '471%', q2: '209%', q3: '-13%', q4: '185%' },
    { metric: 'Fee Revenue', q1: '100%', q2: '175%', q3: '100%', q4: '6394%' },
  ];

  const proposalsData = [
    { month: 'Jan-26', count: 80, amount: 15000000 },
  ];

  const dealsSignedData = [
    { month: 'Jan-26', count: 1, amount: 5000000 },
  ];

  const pipelineData = [
    { month: 'Jan 2026', inDev: 19, devDollars: 176800000, active: 10, activeVol: 39000000, diligence: 4, diligenceDollars: 26500000 },
    { month: 'Feb 2026', inDev: 25, devDollars: 193500000, active: 11, activeVol: 30000000, diligence: 5, diligenceDollars: 30200000 },
    { month: 'Mar 2026', inDev: 30, devDollars: 210200000, active: 12, activeVol: 21000000, diligence: 6, diligenceDollars: 31200000 },
    { month: 'Apr 2026', inDev: 35, devDollars: 226800000, active: 12, activeVol: 12000000, diligence: 6, diligenceDollars: 31200000 },
    { month: 'May 2026', inDev: 40, devDollars: 243500000, active: 14, activeVol: 6600000, diligence: 5, diligenceDollars: 27200000 },
    { month: 'Jun 2026', inDev: 46, devDollars: 260200000, active: 18, activeVol: 7600000, diligence: 5, diligenceDollars: 27200000 },
  ];

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Debt Sales Metrics</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">Year to date</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricStatCard title="Deals on the Board" value="1" />
            <MetricStatCard title="Proposal Issued" value="1" />
            <MetricStatCard title="Clients Signed" value="1" />
            <MetricStatCard title="Avg. Deal Size Added to Board" value="$30,000,000" />
            <MetricStatCard title="Indication of Interest $" value="$0" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <MetricStatCard title="$ on the Board" value="$30,000,000" />
            <MetricStatCard title="Proposal Issued $" value="$15,000,000" />
            <MetricStatCard title="Clients Signed $" value="$15,000,000" />
            <MetricStatCard title="Indication of Interest" value="0" />
          </div>
        </CardContent>
      </Card>

      {/* YoY Change Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">YoY Change</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Metric</TableHead>
                <TableHead>Oct 2025</TableHead>
                <TableHead>Q1-2026</TableHead>
                <TableHead>Q2-2026</TableHead>
                <TableHead>Q3-2026</TableHead>
                <TableHead>Q4-2026</TableHead>
                <TableHead>2026</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yoyChangeData.map((row) => (
                <TableRow key={row.metric}>
                  <TableCell className="font-medium text-xs">{row.metric}</TableCell>
                  <TableCell className={`text-xs ${row.q1.startsWith('-') ? 'text-destructive' : 'text-success'}`}>
                    {row.q1.startsWith('-') ? '' : '+'}{row.q1}
                  </TableCell>
                  <TableCell className={`text-xs ${row.q2.startsWith('-') ? 'text-destructive' : 'text-success'}`}>
                    {row.q2.startsWith('-') ? '' : '+'}{row.q2}
                  </TableCell>
                  <TableCell className={`text-xs ${row.q3.startsWith('-') ? 'text-destructive' : 'text-success'}`}>
                    {row.q3.startsWith('-') ? '' : '+'}{row.q3}
                  </TableCell>
                  <TableCell className={`text-xs ${row.q4.startsWith('-') ? 'text-destructive' : 'text-success'}`}>
                    {row.q4.startsWith('-') ? '' : '+'}{row.q4}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Proposals Issued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={proposalsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="hsl(var(--primary))" name="Count" />
                  <Line yAxisId="right" type="monotone" dataKey="amount" stroke="hsl(var(--chart-2))" name="Amount" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deals Signed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dealsSignedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="hsl(var(--primary))" name="Clients Signed" />
                  <Line yAxisId="right" type="monotone" dataKey="amount" stroke="hsl(var(--chart-2))" name="Dollars Signed" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Deal Size Added to the Board</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ month: 'Jan-26', amount: 5000 }]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Performance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Deals In Development</TableHead>
                <TableHead className="text-right">Dollars in Development</TableHead>
                <TableHead className="text-right">Active Deals</TableHead>
                <TableHead className="text-right">Active Deal Volume</TableHead>
                <TableHead className="text-right">Deals in Diligence</TableHead>
                <TableHead className="text-right">Dollars in Diligence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelineData.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{row.month}</TableCell>
                  <TableCell className="text-right">{row.inDev}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.devDollars)}</TableCell>
                  <TableCell className="text-right">{row.active}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.activeVol)}</TableCell>
                  <TableCell className="text-right">{row.diligence}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.diligenceDollars)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

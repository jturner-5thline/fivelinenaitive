import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(0)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <Badge variant="outline" className="w-fit text-xs">{subtitle}</Badge>}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export function ConsolidatedDebtPipelineDashboard() {
  // Sample data based on PDF
  const dealsOnBoardTrend = [
    { month: 'Aug-25', count: 14 },
    { month: 'Sep-25', count: 17 },
    { month: 'Oct-25', count: 19 },
    { month: 'Nov-25', count: 19 },
    { month: 'Dec-25', count: 9 },
    { month: 'Jan-26', count: 1 },
  ];

  const dollarsOnBoardTrend = [
    { month: 'Aug-25', amount: 178000000 },
    { month: 'Sep-25', count: 205000000 },
    { month: 'Oct-25', amount: 178000000 },
    { month: 'Nov-25', amount: 44000000 },
    { month: 'Dec-25', amount: 30000000 },
    { month: 'Jan-26', amount: 30000000 },
  ];

  const avgDealSizeTrend = [
    { month: 'Aug-25', amount: 10000000 },
    { month: 'Sep-25', amount: 10000000 },
    { month: 'Oct-25', amount: 10000000 },
    { month: 'Nov-25', amount: 10000000 },
    { month: 'Dec-25', amount: 10000000 },
    { month: 'Jan-26', amount: 30000000 },
  ];

  const proposalsIssuedTrend = [
    { month: 'Aug-25', count: 5 },
    { month: 'Sep-25', count: 4 },
    { month: 'Oct-25', count: 3 },
    { month: 'Nov-25', count: 5 },
    { month: 'Dec-25', count: 1 },
    { month: 'Jan-26', count: 1 },
  ];

  const proposalsIssuedDollarsTrend = [
    { month: 'Aug-25', amount: 43000000 },
    { month: 'Sep-25', amount: 25000000 },
    { month: 'Oct-25', amount: 32000000 },
    { month: 'Nov-25', amount: 59000000 },
    { month: 'Dec-25', amount: 20000000 },
    { month: 'Jan-26', amount: 15000000 },
  ];

  const dealsSignedTrend = [
    { month: 'Aug-25', count: 4 },
    { month: 'Sep-25', count: 5 },
    { month: 'Oct-25', count: 3 },
    { month: 'Nov-25', count: 2 },
    { month: 'Dec-25', count: 1 },
    { month: 'Jan-26', count: 1 },
  ];

  const dollarsSignedTrend = [
    { month: 'Aug-25', amount: 15000000 },
    { month: 'Sep-25', amount: 25000000 },
    { month: 'Oct-25', amount: 10000000 },
    { month: 'Nov-25', amount: 30000000 },
    { month: 'Dec-25', amount: 4000000 },
    { month: 'Jan-26', amount: 15000000 },
  ];

  const clientsReceivingTermsTrend = [
    { month: 'Sep-25', count: 3 },
    { month: 'Oct-25', count: 5 },
    { month: 'Dec-25', count: 2 },
  ];

  const clientsReceivingTermsDollarsTrend = [
    { month: 'Sep-25', amount: 20000000 },
    { month: 'Oct-25', amount: 45000000 },
    { month: 'Dec-25', amount: 5000000 },
  ];

  const termsSignedTrend = [
    { month: 'Nov-25', count: 2 },
    { month: 'Dec-25', count: 1 },
  ];

  const termsSignedDollarsTrend = [
    { month: 'Nov-25', amount: 14000000 },
    { month: 'Dec-25', amount: 15000000 },
  ];

  const dealsClosedTrend = [
    { month: 'Nov-25', count: 1 },
    { month: 'Dec-25', count: 1 },
  ];

  const dollarsFundedTrend = [
    { month: 'Nov-25', amount: 4000000 },
    { month: 'Dec-25', amount: 6000000 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Row: Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title="Deals Closed" value={0} subtitle="Quarter to date" />
        <StatCard title="Dollars Funded" value="$0" subtitle="Quarter to date" />
      </div>

      {/* Sales Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sales</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard title="Deals on Board" value={1} subtitle="Quarter to date" />
          <StatCard title="Proposals Issued" value={1} subtitle="Quarter to date" />
          <StatCard title="Deals Signed" value={1} subtitle="Quarter to date" />
          <StatCard title="Terms Issued" value={0} subtitle="Quarter to date" />
          <StatCard title="Terms Signed" value={0} subtitle="Quarter to date" />
          <StatCard title="Avg Deal Signed" value="$30,000,000" subtitle="Quarter to date" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Dollars on Board" value="$30,000,000" subtitle="Quarter to date" />
          <StatCard title="Dollars Proposed" value="$15,000,000" subtitle="Quarter to date" />
          <StatCard title="Dollars Signed" value="$15,000,000" subtitle="Quarter to date" />
          <StatCard title="Terms Issued $" value="$0" subtitle="Quarter to date" />
          <StatCard title="Terms Signed $" value="$0" subtitle="Quarter to date" />
        </div>
      </div>

      {/* Trends Section */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Trends</h3>
        
        {/* Row 1: Deals, Dollars, Avg Deal Size */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Deals on the Board</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dealsOnBoardTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">$ on the Board</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dollarsOnBoardTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Deal Size Added to the Board</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgDealSizeTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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

        {/* Row 2: Proposals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Proposals Issued</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proposalsIssuedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Proposals Issued $</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proposalsIssuedDollarsTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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

        {/* Row 3: Deals Signed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Deals Signed</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dealsSignedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Dollars Signed</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dollarsSignedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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

        {/* Row 4: Clients Receiving Terms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Clients Receiving Terms</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsReceivingTermsTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Clients Receiving Terms $</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsReceivingTermsDollarsTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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

        {/* Row 5: Terms Signed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Terms Signed</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={termsSignedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Terms Signed $</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={termsSignedDollarsTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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

        {/* Deals Section */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-4">Deals</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Deals Closed</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dealsClosedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Dollars Funded</CardTitle>
              <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
            </CardHeader>
            <CardContent>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dollarsFundedTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
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
      </div>
    </div>
  );
}

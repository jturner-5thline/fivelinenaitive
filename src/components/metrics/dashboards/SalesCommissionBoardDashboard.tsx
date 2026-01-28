import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

interface SalesCommissionBoardProps {
  ownerName: string;
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(0)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

function NoDataCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <Badge variant="outline" className="w-fit text-xs">{subtitle}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Lock className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">No Data Available</p>
        <p className="text-xs text-center max-w-[200px]">This might happen because of a global filter or a change in the underlying data</p>
      </CardContent>
    </Card>
  );
}

function MQLGaugeCard({ value = 0 }: { value?: number }) {
  const gaugeData = [
    { name: 'current', value: value },
    { name: 'remaining', value: 100 - value },
  ];
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">MQL % Holder</CardTitle>
        <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
      </CardHeader>
      <CardContent>
        <div className="h-[140px] flex flex-col items-center justify-center">
          <div className="relative">
            <ResponsiveContainer width={160} height={80}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="100%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={50}
                  outerRadius={70}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill="hsl(var(--success))" />
                  <Cell fill="hsl(var(--muted))" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
              <p className="text-2xl font-bold">{value}%</p>
              <p className="text-xs text-muted-foreground">Current status</p>
            </div>
          </div>
          <div className="flex justify-between w-full mt-2 text-xs text-muted-foreground px-4">
            <span>0%</span>
            <span className="text-success">100% Goal</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesCommissionBoardDashboard({ ownerName }: SalesCommissionBoardProps) {
  // Sample data - in real app this would be filtered by ownerName
  const hasData = ownerName === 'James Turner';

  const dealsOnBoardData = hasData ? [{ month: 'Jan-26', count: 1 }] : [];
  const dollarsOnBoardData = hasData ? [{ month: 'Jan-26', amount: 30000000 }] : [];
  const proposalsIssuedData = hasData ? [{ month: 'Jan-26', count: 1, amount: 15000000 }] : [];
  const clientsSignedData = hasData ? [{ month: 'Jan-26', count: 1, amount: 15000000 }] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Badge variant="default" className="text-xs">Deal owner: {ownerName}</Badge>
      </div>

      {/* Row 1: Deals on Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deals on the Board</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dealsOnBoardData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">$ on the Board</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dollarsOnBoardData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Deal Size Added to the Board</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dollarsOnBoardData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Proposals Issued */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Proposals Issued</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proposalsIssuedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Proposals Issued $</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proposalsIssuedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Clients Signed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clients Signed</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsSignedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clients Signed $</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientsSignedData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Lock className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No Data Available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Clients Receiving Terms & MQL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasData ? (
          <NoDataCard title="Clients Receiving Terms" subtitle="Quarter to date" />
        ) : (
          <NoDataCard title="Clients Receiving Terms" subtitle="Quarter to date" />
        )}
        <MQLGaugeCard value={hasData ? 0 : 0} />
      </div>

      {/* Row 5: Terms Signed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Terms Signed" subtitle="Quarter to date" />
        <NoDataCard title="Terms Signed $" subtitle="Quarter to date" />
      </div>

      {/* Row 6: Deals Closed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Deals Closed" subtitle="Quarter to date" />
        <NoDataCard title="Deals Closed $" subtitle="Quarter to date" />
      </div>
    </div>
  );
}

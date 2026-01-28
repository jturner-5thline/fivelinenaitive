import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface ChandlerSalesCommissionProps {
  ownerName?: string;
}

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

export function ChandlerSalesCommissionDashboard({ ownerName = "Chandler Minaldi" }: ChandlerSalesCommissionProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Badge variant="default" className="text-xs">Deal owner: {ownerName}</Badge>
      </div>

      {/* Row 1: Deals on Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NoDataCard title="Deals on the Board" subtitle="Quarter to date" />
        <NoDataCard title="$ on the Board" subtitle="Quarter to date" />
        <NoDataCard title="Average Deal Size Added to the Board" subtitle="Quarter to date" />
      </div>

      {/* Row 2: Proposals Issued */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Proposals Issued" subtitle="Quarter to date" />
        <NoDataCard title="Proposals Issued $" subtitle="Quarter to date" />
      </div>

      {/* Row 3: Clients Signed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Clients Signed" subtitle="Quarter to date" />
        <NoDataCard title="Clients Signed $" subtitle="Quarter to date" />
      </div>

      {/* Row 4: Clients Receiving Terms & MQL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Clients Receiving Terms" subtitle="Quarter to date" />
        <MQLGaugeCard value={0} />
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

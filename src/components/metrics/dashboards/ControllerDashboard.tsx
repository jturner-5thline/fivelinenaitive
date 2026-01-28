import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from 'recharts';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function NoDataCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Lock className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">No Data Available</p>
        <p className="text-xs text-center">This might happen because of a global filter or a change in the underlying data</p>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm text-destructive">Something went wrong</p>
      </CardContent>
    </Card>
  );
}

export function ControllerDashboard() {
  // Credit Card Balances data
  const creditCardData = [
    { name: 'AMEX 41002', balance: 91185 },
    { name: 'Amex x82008', balance: 54575 },
    { name: 'Wells Fargo CC #5733', balance: 3250 },
    { name: 'Wells Fargo CC #5758', balance: 523 },
  ];

  // FY2025 Sales by Client: 5LFS
  const sales5LFSData = [
    { customer: 'Anyplace', amount: 150000, percent: 20 },
    { customer: 'Enklu, Inc.', amount: 133000, percent: 18 },
    { customer: 'Laura Shin Media LLC', amount: 101000, percent: 13 },
    { customer: 'Forrest-Co', amount: 77000, percent: 10 },
    { customer: 'i-Genie.ai', amount: 66000, percent: 9 },
    { customer: 'Alloy Labs', amount: 66000, percent: 9 },
    { customer: 'Blueleaf', amount: 52000, percent: 7 },
    { customer: 'WealthCentral', amount: 42000, percent: 6 },
    { customer: 'TurnKey Beauty', amount: 40000, percent: 5 },
    { customer: 'Franscale Landscaping', amount: 20000, percent: 3 },
  ];

  // FY2025 Sales by Client: 5LCA  
  const sales5LCAData = [
    { customer: 'Camila M...', amount: 1300000, percent: 36 },
    { customer: 'EarthDoll...', amount: 840000, percent: 23 },
    { customer: 'sift Digit...', amount: 400000, percent: 11 },
    { customer: 'Safety Me...', amount: 211000, percent: 6 },
    { customer: 'Portfoli...', amount: 210000, percent: 6 },
    { customer: 'True Nort...', amount: 200000, percent: 6 },
    { customer: 'Soapbox', amount: 150000, percent: 4 },
    { customer: 'iveelube', amount: 80000, percent: 2 },
    { customer: 'Gauge', amount: 75000, percent: 2 },
    { customer: 'Muddy W...', amount: 65000, percent: 2 },
    { customer: 'Great Fro...', amount: 30000, percent: 1 },
    { customer: 'Coherix', amount: 20000, percent: 1 },
  ];

  // Outstanding A/R Balances by Entity
  const arBalancesData = [
    { entity: '5th Line Capital Advisors LLC', balance: 65000 },
    { entity: '5th Line Financial Services, LLC', balance: 19805 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Total Liquidity & Credit Card Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoDataCard title="Total Liquidity: (Chase/M&T)" />
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Credit Card Balances</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Account Full: AMEX 41002, Amex x8...</Badge>
              <Badge variant="outline" className="text-xs">Reporting Month: Aug-25</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={creditCardData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="balance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: FY2025 Sales by Client */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FY2025 Sales by Client: 5LFS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales5LFSData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="customer" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${formatCurrency(value)} (${props.payload.percent}%)`, 
                      'Amount'
                    ]} 
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">FY2025 Sales by Client: 5LCA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales5LCAData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="customer" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${formatCurrency(value)} (${props.payload.percent}%)`, 
                      'Amount'
                    ]} 
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Income & A/R */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ErrorCard title="Income: YTD vs. Previous Year" />
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding A/R Balances by Entity</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">Account Full: Accounts Receivable...</Badge>
              <Badge variant="outline" className="text-xs">Reporting Month: Last 1</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={arBalancesData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="entity" type="category" width={180} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="balance" fill="hsl(var(--primary))" name="5th Line Capital Advisors LLC" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span>5th Line Capital Advisors LLC</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-chart-2" />
                <span>5th Line Financial Services, LLC</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <ErrorCard title="Income: Entity Breakdown" />
      </div>
    </div>
  );
}

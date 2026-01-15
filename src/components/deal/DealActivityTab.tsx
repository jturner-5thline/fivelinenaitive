import { Eye, FileText, Mail, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays } from 'date-fns';

interface DealActivityTabProps {
  dealId: string;
}

// Generate mock data for the last 14 days
const generateMockChartData = () => {
  const data = [];
  for (let i = 13; i >= 0; i--) {
    const date = subDays(new Date(), i);
    data.push({
      date: format(date, 'MMM d'),
      views: 0,
    });
  }
  return data;
};

const chartData = generateMockChartData();

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

const StatCard = ({ icon, label, value }: StatCardProps) => (
  <div className="flex flex-col items-center justify-center p-4 border rounded-lg bg-card">
    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
      {icon}
      <span>{label}</span>
    </div>
    <span className="text-3xl font-semibold">{value}</span>
  </div>
);

export function DealActivityTab({ dealId }: DealActivityTabProps) {
  // These would be fetched from the database in a real implementation
  const stats = {
    views: 0,
    dataRoom: 0,
    infoRequests: 0,
    uniqueUsers: 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Views"
          value={stats.views}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Data Room"
          value={stats.dataRoom}
        />
        <StatCard
          icon={<Mail className="h-4 w-4" />}
          label="Info Requests"
          value={stats.infoRequests}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Unique Users"
          value={stats.uniqueUsers}
        />
      </div>

      {/* Analytics Placeholder */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <TrendingUp className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground text-center">
            Analytics will be available once user activity tracking is enabled.
          </p>
        </CardContent>
      </Card>

      {/* Activity Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Activity Trend (Last 14 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '10px' }}
                  iconType="circle"
                />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  name="Views"
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

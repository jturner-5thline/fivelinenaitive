import { useMemo } from "react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HistoricalInsight {
  id: string;
  created_at: string;
  pipeline_health_score: number;
  total_value: number;
  active_deals: number;
}

interface HealthScoreTrendChartProps {
  history: HistoricalInsight[];
}

export function HealthScoreTrendChart({ history }: HealthScoreTrendChartProps) {
  const chartData = useMemo(() => {
    // Reverse to show oldest first (left to right)
    return [...history]
      .reverse()
      .map((item) => ({
        date: format(new Date(item.created_at), "MMM d"),
        fullDate: format(new Date(item.created_at), "MMM d, yyyy h:mm a"),
        score: item.pipeline_health_score,
        totalValue: item.total_value,
        activeDeals: item.active_deals,
      }));
  }, [history]);

  const trendInfo = useMemo(() => {
    if (chartData.length < 2) return null;
    
    const latest = chartData[chartData.length - 1].score;
    const previous = chartData[chartData.length - 2].score;
    const diff = latest - previous;
    
    const allScores = chartData.map(d => d.score);
    const avg = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    const max = Math.max(...allScores);
    const min = Math.min(...allScores);
    
    return { diff, avg, max, min, latest };
  }, [chartData]);

  if (history.length < 2) {
    return null;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm">{data.fullDate}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">Health Score:</span>{" "}
              <span className="font-semibold">{data.score}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Active Deals:</span>{" "}
              <span className="font-semibold">{data.activeDeals}</span>
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Total Value:</span>{" "}
              <span className="font-semibold">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(data.totalValue)}
              </span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Health Score Trend
            </CardTitle>
            <CardDescription>
              Pipeline health score changes over time
            </CardDescription>
          </div>
          {trendInfo && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  {trendInfo.diff > 0 && (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  )}
                  {trendInfo.diff < 0 && (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  {trendInfo.diff === 0 && (
                    <Minus className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span
                    className={`text-lg font-semibold ${
                      trendInfo.diff > 0
                        ? "text-green-600"
                        : trendInfo.diff < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {trendInfo.diff > 0 ? "+" : ""}
                    {trendInfo.diff}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">vs previous</span>
              </div>
              <div className="text-right border-l pl-4">
                <div className="text-lg font-semibold">{trendInfo.avg}</div>
                <span className="text-xs text-muted-foreground">avg score</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="fill-muted-foreground"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="fill-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              {trendInfo && (
                <ReferenceLine
                  y={trendInfo.avg}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {trendInfo && (
          <div className="flex justify-center gap-6 mt-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-sm font-medium text-green-600">{trendInfo.max}</div>
              <div className="text-xs text-muted-foreground">Highest</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-red-600">{trendInfo.min}</div>
              <div className="text-xs text-muted-foreground">Lowest</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium">{chartData.length}</div>
              <div className="text-xs text-muted-foreground">Data Points</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

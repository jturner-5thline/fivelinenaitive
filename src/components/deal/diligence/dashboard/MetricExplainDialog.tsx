import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MetricExplanation } from '../calculations/useFinancialCalculations';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid } from 'recharts';

interface MetricExplainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricLabel: string;
  explanation: MetricExplanation | null;
}

export function MetricExplainDialog({ open, onOpenChange, metricLabel, explanation }: MetricExplainDialogProps) {
  if (!explanation) return null;

  const chartData = explanation.timeSeries
    .filter(ts => ts.value != null)
    .map(ts => ({ period: ts.period, value: Number(ts.value?.toFixed(2)) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Explain: {metricLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Formula */}
          <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Formula</p>
            <p className="text-sm font-mono font-semibold">{explanation.formula}</p>
          </div>

          {/* Inputs */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Inputs</p>
            <div className="space-y-1.5">
              {explanation.inputs.map((inp, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{inp.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{inp.value}</span>
                    {inp.source && (
                      <Badge variant="outline" className="text-[9px] h-4 font-mono">
                        {inp.source}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Time Series Chart */}
          {chartData.length > 1 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Trend Over Time</p>
              <div className="h-40 rounded-lg border border-border/20 bg-muted/10 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <ReTooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Narrative */}
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
            <p className="text-xs text-foreground leading-relaxed">{explanation.narrative}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

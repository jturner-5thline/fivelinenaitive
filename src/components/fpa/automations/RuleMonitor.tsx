import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, AlertTriangle, TrendingUp, TrendingDown, DollarSign,
  BarChart3, Shield, Eye, Pencil, Trash2, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonitorRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: string;
  severity: 'critical' | 'warning' | 'info';
  channel: string;
  isActive: boolean;
  lastTriggered: string | null;
  triggerCount: number;
}

const RULES: MonitorRule[] = [
  {
    id: 'r1',
    name: 'OPEX Budget Overrun',
    metric: 'Total OPEX',
    condition: 'exceeds budget by',
    threshold: '5%',
    severity: 'critical',
    channel: 'Slack #finance-alerts + Email CFO',
    isActive: true,
    lastTriggered: '2 days ago',
    triggerCount: 3,
  },
  {
    id: 'r2',
    name: 'Revenue Miss Warning',
    metric: 'Monthly Revenue',
    condition: 'falls below forecast by',
    threshold: '10%',
    severity: 'warning',
    channel: 'Slack #exec-team',
    isActive: true,
    lastTriggered: null,
    triggerCount: 0,
  },
  {
    id: 'r3',
    name: 'Payroll Spike Detection',
    metric: 'Payroll Expense',
    condition: 'month-over-month increase exceeds',
    threshold: '15%',
    severity: 'warning',
    channel: 'Email HR + Finance',
    isActive: true,
    lastTriggered: '14 days ago',
    triggerCount: 1,
  },
  {
    id: 'r4',
    name: 'Cash Runway Alert',
    metric: 'Cash Runway (months)',
    condition: 'drops below',
    threshold: '6 months',
    severity: 'critical',
    channel: 'Slack #exec-team + Email CEO',
    isActive: true,
    lastTriggered: null,
    triggerCount: 0,
  },
  {
    id: 'r5',
    name: 'Gross Margin Erosion',
    metric: 'Gross Margin %',
    condition: 'decreases by more than',
    threshold: '3pp',
    severity: 'info',
    channel: 'In-App Notification',
    isActive: false,
    lastTriggered: '30 days ago',
    triggerCount: 2,
  },
  {
    id: 'r6',
    name: 'Vendor Concentration Risk',
    metric: 'Top Vendor % of COGS',
    condition: 'exceeds',
    threshold: '40%',
    severity: 'warning',
    channel: 'Slack #procurement',
    isActive: true,
    lastTriggered: null,
    triggerCount: 0,
  },
];

const severityConfig = {
  critical: { color: 'text-destructive bg-destructive/10 border-destructive/20', icon: AlertTriangle, dot: 'bg-destructive' },
  warning: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: AlertTriangle, dot: 'bg-amber-500' },
  info: { color: 'text-blue-600 bg-blue-500/10 border-blue-500/20', icon: Eye, dot: 'bg-blue-500' },
};

export function RuleMonitor() {
  const [rules, setRules] = useState(RULES);
  const [showAdd, setShowAdd] = useState(false);

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const activeCount = rules.filter(r => r.isActive).length;
  const triggeredCount = rules.filter(r => r.lastTriggered).length;

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-3 w-3" /> {activeCount} active rules
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Bell className="h-3 w-3" /> {triggeredCount} triggered
          </Badge>
        </div>
        <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3 w-3" /> New Rule
        </Button>
      </div>

      {/* Add Rule Form */}
      {showAdd && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="p-3 space-y-3">
            <p className="text-xs font-medium">Create Monitoring Rule</p>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Metric</label>
                <Select defaultValue="opex">
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opex">Total OPEX</SelectItem>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="margin">Gross Margin</SelectItem>
                    <SelectItem value="runway">Cash Runway</SelectItem>
                    <SelectItem value="payroll">Payroll</SelectItem>
                    <SelectItem value="cogs">COGS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Condition</label>
                <Select defaultValue="exceeds">
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exceeds">Exceeds budget by</SelectItem>
                    <SelectItem value="below">Falls below</SelectItem>
                    <SelectItem value="mom">MoM change exceeds</SelectItem>
                    <SelectItem value="decrease">Decreases by</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Threshold</label>
                <Input className="h-7 text-xs" placeholder="5%" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Severity</label>
                <Select defaultValue="warning">
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Create Rule</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      {rules.map((rule) => {
        const sev = severityConfig[rule.severity];
        return (
          <Card key={rule.id} className={cn("transition-opacity", !rule.isActive && "opacity-50")}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className={cn("h-2 w-2 rounded-full shrink-0", sev.dot, !rule.isActive && "bg-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{rule.name}</span>
                    <Badge variant="outline" className={cn("text-[9px]", sev.color)}>
                      {rule.severity}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    When <span className="font-medium text-foreground/80">{rule.metric}</span> {rule.condition}{' '}
                    <span className="font-mono text-foreground/80">{rule.threshold}</span>
                    {' → '}{rule.channel}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {rule.lastTriggered ? (
                      <span>Last triggered: {rule.lastTriggered}</span>
                    ) : (
                      <span>Never triggered</span>
                    )}
                    <span>•</span>
                    <span>{rule.triggerCount} total triggers</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={() => toggleRule(rule.id)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

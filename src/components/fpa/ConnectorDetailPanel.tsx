import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Settings2, Shield, Loader2, Zap, Database
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface GLMapping {
  sourceAccount: string;
  sourceCode: string;
  targetCategory: string;
  confidence: number;
  status: 'mapped' | 'pending' | 'skipped';
}

const DEMO_MAPPINGS: GLMapping[] = [
  { sourceAccount: '4000 - Sales Revenue', sourceCode: '4000', targetCategory: 'Revenue', confidence: 0.99, status: 'mapped' },
  { sourceAccount: '4100 - Service Income', sourceCode: '4100', targetCategory: 'Revenue', confidence: 0.95, status: 'mapped' },
  { sourceAccount: '5000 - Cost of Sales', sourceCode: '5000', targetCategory: 'COGS', confidence: 0.97, status: 'mapped' },
  { sourceAccount: '6000 - Salaries', sourceCode: '6000', targetCategory: 'Operating Expenses', confidence: 0.98, status: 'mapped' },
  { sourceAccount: '6100 - Marketing', sourceCode: '6100', targetCategory: 'S&M', confidence: 0.92, status: 'pending' },
  { sourceAccount: '6200 - Rent', sourceCode: '6200', targetCategory: 'G&A', confidence: 0.94, status: 'pending' },
  { sourceAccount: '6300 - Utilities', sourceCode: '6300', targetCategory: 'G&A', confidence: 0.88, status: 'pending' },
  { sourceAccount: '7000 - Depreciation', sourceCode: '7000', targetCategory: 'D&A', confidence: 0.99, status: 'mapped' },
];

const SYNC_HISTORY = [
  { time: '2 min ago', status: 'success' as const, records: 847, duration: '12s' },
  { time: '1 hr ago', status: 'success' as const, records: 847, duration: '14s' },
  { time: '2 hrs ago', status: 'success' as const, records: 845, duration: '11s' },
  { time: '6 hrs ago', status: 'warning' as const, records: 840, duration: '45s' },
  { time: '12 hrs ago', status: 'success' as const, records: 840, duration: '13s' },
];

interface ConnectorDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connector: {
    id: string;
    name: string;
    icon: string;
    status: 'connected' | 'available';
  } | null;
}

export function ConnectorDetailPanel({ open, onOpenChange, connector }: ConnectorDetailPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'mappings' | 'history'>('overview');

  if (!connector) return null;

  const isConnected = connector.status === 'connected';

  const handleSync = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2000));
    setSyncing(false);
    toast.success(`${connector.name} synced successfully`, { description: '847 records updated' });
  };

  const handleConnect = () => {
    toast.info(`OAuth flow for ${connector.name} would start here`, {
      description: 'Redirecting to authorization...',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{connector.icon}</span>
            <div>
              <DialogTitle>{connector.name}</DialogTitle>
              <DialogDescription>
                {isConnected ? 'Connected & syncing' : 'Available to connect'}
              </DialogDescription>
            </div>
            <Badge
              variant={isConnected ? 'default' : 'outline'}
              className="ml-auto text-[10px]"
            >
              {isConnected ? '✓ Connected' : 'Not Connected'}
            </Badge>
          </div>
        </DialogHeader>

        {!isConnected ? (
          <div className="space-y-4 py-4">
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <span className="text-4xl">{connector.icon}</span>
                <h3 className="text-sm font-semibold">Connect {connector.name}</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Authorize access to sync your financial data automatically. We use OAuth 2.0 — your credentials are never stored.
                </p>
                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                  <Shield className="h-3 w-3" /> Read-only access · 256-bit encryption · SOC 2 compliant
                </div>
                <Button className="gap-2" onClick={handleConnect}>
                  <Zap className="h-4 w-4" />
                  Connect {connector.name}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tab buttons */}
            <div className="flex gap-1 border-b">
              {(['overview', 'mappings', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold">847</p>
                    <p className="text-[10px] text-muted-foreground">Records synced</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold text-emerald-600">99.8%</p>
                    <p className="text-[10px] text-muted-foreground">Uptime (30d)</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-lg font-bold">12s</p>
                    <p className="text-[10px] text-muted-foreground">Avg sync time</p>
                  </Card>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Sync frequency</span>
                    <Select defaultValue="hourly">
                      <SelectTrigger className="h-7 w-28 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="realtime">Real-time</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Auto-map new accounts</span>
                    <Switch defaultChecked className="scale-75" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Error notifications</span>
                    <Switch defaultChecked className="scale-75" />
                  </div>
                </div>

                <Button className="w-full gap-2" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>
            )}

            {activeTab === 'mappings' && (
              <ScrollArea className="h-72">
                <div className="space-y-1">
                  {DEMO_MAPPINGS.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[11px] truncate">{m.sourceAccount}</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Badge variant="secondary" className="text-[10px] shrink-0">{m.targetCategory}</Badge>
                      <span className={cn(
                        "text-[10px] font-mono w-10 text-right",
                        m.confidence >= 0.95 ? 'text-emerald-600' : 'text-amber-600'
                      )}>
                        {(m.confidence * 100).toFixed(0)}%
                      </span>
                      <Badge
                        variant={m.status === 'mapped' ? 'default' : 'outline'}
                        className="text-[9px] w-14 justify-center"
                      >
                        {m.status === 'mapped' ? '✓' : '⏳'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {activeTab === 'history' && (
              <ScrollArea className="h-60">
                <div className="space-y-1">
                  {SYNC_HISTORY.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-xs">
                      {h.status === 'success' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="text-muted-foreground w-20">{h.time}</span>
                      <span className="font-mono">{h.records} records</span>
                      <span className="text-muted-foreground ml-auto">{h.duration}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

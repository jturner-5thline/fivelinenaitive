import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  MessageSquare, Mail, Bell, Smartphone, Settings2,
  CheckCircle2, XCircle, ExternalLink, TestTube
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertChannel {
  id: string;
  type: 'slack' | 'email' | 'in-app' | 'webhook';
  name: string;
  config: string;
  isConnected: boolean;
  isActive: boolean;
  lastUsed: string | null;
}

const CHANNELS: AlertChannel[] = [
  { id: 'c1', type: 'slack', name: 'Slack – #finance-alerts', config: 'workspace: acme-corp', isConnected: true, isActive: true, lastUsed: '2 hrs ago' },
  { id: 'c2', type: 'slack', name: 'Slack – #exec-team', config: 'workspace: acme-corp', isConnected: true, isActive: true, lastUsed: '3 days ago' },
  { id: 'c3', type: 'email', name: 'Email – CFO', config: 'cfo@acmecorp.com', isConnected: true, isActive: true, lastUsed: '1 day ago' },
  { id: 'c4', type: 'email', name: 'Email – Finance Team', config: 'finance-team@acmecorp.com', isConnected: true, isActive: true, lastUsed: '5 days ago' },
  { id: 'c5', type: 'in-app', name: 'In-App Notifications', config: 'All team members', isConnected: true, isActive: true, lastUsed: '30 min ago' },
  { id: 'c6', type: 'webhook', name: 'Custom Webhook', config: 'https://api.example.com/alerts', isConnected: false, isActive: false, lastUsed: null },
];

const channelIcons = {
  slack: MessageSquare,
  email: Mail,
  'in-app': Bell,
  webhook: ExternalLink,
};

const channelColors = {
  slack: 'text-purple-600 bg-purple-500/10',
  email: 'text-blue-600 bg-blue-500/10',
  'in-app': 'text-amber-600 bg-amber-500/10',
  webhook: 'text-emerald-600 bg-emerald-500/10',
};

interface DigestSetting {
  name: string;
  description: string;
  enabled: boolean;
}

export function AlertingConfig() {
  const [channels, setChannels] = useState(CHANNELS);
  const [digests, setDigests] = useState<DigestSetting[]>([
    { name: 'Daily Summary', description: 'Digest of all alerts and automation runs at 8:00 AM', enabled: true },
    { name: 'Weekly Report', description: 'Weekly summary of variances, data health, and KPIs — Mondays 9:00 AM', enabled: true },
    { name: 'Monthly Board Packet', description: 'Auto-generate board report with key metrics — 1st of month', enabled: false },
  ]);

  const toggleChannel = (id: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));
  };

  const toggleDigest = (index: number) => {
    setDigests(prev => prev.map((d, i) => i === index ? { ...d, enabled: !d.enabled } : d));
  };

  return (
    <div className="space-y-4">
      {/* Alert Channels */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium">Alert Channels</h3>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <Settings2 className="h-3 w-3" /> Connect Channel
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {channels.map((channel) => {
            const Icon = channelIcons[channel.type];
            return (
              <Card key={channel.id} className={cn(!channel.isActive && "opacity-50")}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", channelColors[channel.type])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium truncate">{channel.name}</span>
                        {channel.isConnected ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{channel.config}</p>
                      {channel.lastUsed && (
                        <p className="text-[10px] text-muted-foreground">Last used: {channel.lastUsed}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Send test">
                        <TestTube className="h-3 w-3" />
                      </Button>
                      <Switch
                        checked={channel.isActive}
                        onCheckedChange={() => toggleChannel(channel.id)}
                        disabled={!channel.isConnected}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Scheduled Digests */}
      <div>
        <h3 className="text-xs font-medium mb-3">Scheduled Digests</h3>
        <div className="space-y-2">
          {digests.map((digest, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">{digest.name}</span>
                      <Badge variant={digest.enabled ? 'default' : 'secondary'} className="text-[9px]">
                        {digest.enabled ? 'Active' : 'Off'}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{digest.description}</p>
                  </div>
                  <Switch
                    checked={digest.enabled}
                    onCheckedChange={() => toggleDigest(i)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

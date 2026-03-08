import { useState, useEffect } from 'react';
import { Shield, Plus, X, Bot, Globe, Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTrackingSettings, useSaveTrackingSettings, useDistributionStats } from '@/hooks/useDistributionStats';

export function DistributionStatsSettings() {
  const { data: settings, isLoading } = useTrackingSettings();
  const { data: stats = [] } = useDistributionStats();
  const saveMutation = useSaveTrackingSettings();

  const [domains, setDomains] = useState<string[]>([]);
  const [ipRanges, setIpRanges] = useState<string[]>([]);
  const [excludeBots, setExcludeBots] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [newIp, setNewIp] = useState('');

  useEffect(() => {
    if (settings) {
      setDomains(settings.internal_domains || []);
      setIpRanges(settings.internal_ip_ranges || []);
      setExcludeBots(settings.exclude_bot_traffic ?? true);
    }
  }, [settings]);

  const addDomain = () => {
    if (newDomain.trim() && !domains.includes(newDomain.trim())) {
      setDomains([...domains, newDomain.trim()]);
      setNewDomain('');
    }
  };

  const addIp = () => {
    if (newIp.trim() && !ipRanges.includes(newIp.trim())) {
      setIpRanges([...ipRanges, newIp.trim()]);
      setNewIp('');
    }
  };

  const handleSave = () => {
    saveMutation.mutate({
      internal_domains: domains,
      internal_ip_ranges: ipRanges,
      exclude_bot_traffic: excludeBots,
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {/* Tracking Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Internal Traffic Filtering
          </CardTitle>
          <CardDescription>
            Configure which domains and IP ranges should be excluded from distribution statistics to get accurate engagement metrics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bot Traffic */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label>Exclude Bot Traffic</Label>
                <p className="text-xs text-muted-foreground">Filter out automated bots and security scanners</p>
              </div>
            </div>
            <Switch checked={excludeBots} onCheckedChange={setExcludeBots} />
          </div>

          <Separator />

          {/* Internal Domains */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Label>Internal Email Domains</Label>
            </div>
            <p className="text-xs text-muted-foreground">Opens/clicks from these domains will be excluded from clean stats.</p>
            <div className="flex gap-2">
              <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="e.g. yourcompany.com"
                onKeyDown={e => e.key === 'Enter' && addDomain()} className="max-w-xs" />
              <Button variant="outline" size="sm" onClick={addDomain}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {domains.map(d => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => setDomains(domains.filter(x => x !== d))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {domains.length === 0 && <span className="text-xs text-muted-foreground">No domains configured</span>}
            </div>
          </div>

          <Separator />

          {/* Internal IP Ranges */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <Label>Internal IP Ranges</Label>
            </div>
            <p className="text-xs text-muted-foreground">CIDR ranges (e.g. 192.168.1.0/24) to exclude from tracking.</p>
            <div className="flex gap-2">
              <Input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="e.g. 10.0.0.0/8"
                onKeyDown={e => e.key === 'Enter' && addIp()} className="max-w-xs" />
              <Button variant="outline" size="sm" onClick={addIp}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ipRanges.map(ip => (
                <Badge key={ip} variant="secondary" className="gap-1 font-mono text-xs">
                  {ip}
                  <button onClick={() => setIpRanges(ipRanges.filter(x => x !== ip))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {ipRanges.length === 0 && <span className="text-xs text-muted-foreground">No IP ranges configured</span>}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            Save Tracking Settings
          </Button>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      {stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution Stats (Clean vs Raw)</CardTitle>
            <CardDescription>Side-by-side comparison of raw and filtered engagement metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Raw</TableHead>
                  <TableHead className="text-right">Clean</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const totals = stats.reduce((acc, s) => ({
                    rawSends: acc.rawSends + s.raw_sends,
                    rawOpens: acc.rawOpens + s.raw_opens,
                    rawClicks: acc.rawClicks + s.raw_clicks,
                    rawBounces: acc.rawBounces + s.raw_bounces,
                    cleanSends: acc.cleanSends + s.clean_sends,
                    cleanOpens: acc.cleanOpens + s.clean_opens,
                    cleanClicks: acc.cleanClicks + s.clean_clicks,
                    cleanBounces: acc.cleanBounces + s.clean_bounces,
                  }), { rawSends: 0, rawOpens: 0, rawClicks: 0, rawBounces: 0, cleanSends: 0, cleanOpens: 0, cleanClicks: 0, cleanBounces: 0 });
                  
                  const rows = [
                    { label: 'Sends', raw: totals.rawSends, clean: totals.cleanSends },
                    { label: 'Opens', raw: totals.rawOpens, clean: totals.cleanOpens },
                    { label: 'Clicks', raw: totals.rawClicks, clean: totals.cleanClicks },
                    { label: 'Bounces', raw: totals.rawBounces, clean: totals.cleanBounces },
                  ];
                  return rows.map(r => (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right">{r.raw.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.clean.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.raw - r.clean > 0 ? `-${(r.raw - r.clean).toLocaleString()}` : '0'}
                      </TableCell>
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

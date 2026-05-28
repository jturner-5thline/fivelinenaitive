import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, Mail, MessageSquare, Smartphone, Zap, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { EventDrawer, eventRowClass } from './event-table/EventDrawer';

interface AuditRow {
  id: string;
  trigger_key: string;
  recipient_user_id: string;
  deal_id: string | null;
  channel: string;
  status: string;
  title: string | null;
  error_message: string | null;
  created_at: string;
  recipient?: { display_name: string | null; first_name: string | null; last_name: string | null } | null;
  deal?: { name: string | null } | null;
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  in_app: <Bell className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  slack: <MessageSquare className="h-3 w-3" />,
  sms: <Smartphone className="h-3 w-3" />,
  push: <Zap className="h-3 w-3" />,
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  delivered: 'default',
  failed: 'destructive',
  skipped: 'outline',
  suppressed: 'outline',
  pending: 'secondary',
};

export function NotificationAuditPanel() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-audit', statusFilter, channelFilter],
    queryFn: async () => {
      let q = supabase
        .from('notification_audit')
        .select('id, trigger_key, recipient_user_id, deal_id, channel, status, title, error_message, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
      const { data: rows, error } = await q;
      if (error) throw error;

      // Hydrate recipients + deals
      const userIds = Array.from(new Set((rows || []).map((r: any) => r.recipient_user_id).filter(Boolean)));
      const dealIds = Array.from(new Set((rows || []).map((r: any) => r.deal_id).filter(Boolean)));

      const [profilesRes, dealsRes] = await Promise.all([
        userIds.length
          ? supabase.from('profiles').select('user_id, display_name, first_name, last_name').in('user_id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        dealIds.length
          ? supabase.from('deals').select('id, name').in('id', dealIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
      const dealMap = new Map((dealsRes.data || []).map((d: any) => [d.id, d]));

      return (rows || []).map((r: any) => ({
        ...r,
        recipient: profileMap.get(r.recipient_user_id) || null,
        deal: r.deal_id ? dealMap.get(r.deal_id) || null : null,
      })) as AuditRow[];
    },
  });

  const filtered = (data || []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.trigger_key.toLowerCase().includes(q) ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.deal?.name || '').toLowerCase().includes(q) ||
      (r.recipient?.display_name || '').toLowerCase().includes(q) ||
      (r.recipient?.first_name || '').toLowerCase().includes(q) ||
      (r.recipient?.last_name || '').toLowerCase().includes(q)
    );
  });

  const recipientName = (r: AuditRow) => {
    const p = r.recipient;
    if (!p) return '—';
    return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Audit
        </CardTitle>
        <CardDescription>
          Delivery log of every notification sent by the engine (latest 500). Use for verifying follow-up workflow, morning digest, and stage-trigger delivery.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search trigger, deal, recipient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="in_app">In-app</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="push">Push</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No notification audit entries found.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className={eventRowClass} onClick={() => setSelected(r)}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.trigger_key}</TableCell>
                    <TableCell className="text-sm">{recipientName(r)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.deal?.name || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        {CHANNEL_ICON[r.channel]}
                        <span>{r.channel}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <Badge variant={STATUS_VARIANT[r.status] || 'outline'} className="text-[10px]">
                          {r.status}
                        </Badge>
                        {r.error_message && (
                          <div className="text-[10px] text-destructive max-w-xs truncate" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <EventDrawer
          open={!!selected}
          onOpenChange={(o) => !o && setSelected(null)}
          icon={selected ? CHANNEL_ICON[selected.channel] ?? <Bell className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          title={selected?.title || selected?.trigger_key || 'Notification'}
          subtitle={selected ? `Trigger: ${selected.trigger_key}` : undefined}
          timestamp={selected?.created_at}
          badges={
            selected
              ? [
                  { label: selected.status, variant: STATUS_VARIANT[selected.status] ?? 'outline' },
                  { label: selected.channel, variant: 'outline' },
                ]
              : []
          }
          fields={
            selected
              ? [
                  { label: 'Recipient', value: recipientName(selected) },
                  { label: 'Recipient ID', value: selected.recipient_user_id, mono: true },
                  { label: 'Deal', value: selected.deal?.name || '—' },
                  { label: 'Deal ID', value: selected.deal_id ?? '—', mono: true },
                  { label: 'Channel', value: selected.channel },
                  { label: 'Trigger', value: selected.trigger_key, mono: true },
                  ...(selected.error_message
                    ? [{ label: 'Error', value: <span className="text-destructive">{selected.error_message}</span> }]
                    : []),
                ]
              : []
          }
          raw={selected}
        />
      </CardContent>
    </Card>
  );
}

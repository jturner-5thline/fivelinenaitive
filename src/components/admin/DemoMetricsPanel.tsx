import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type DemoCounts = Record<string, number>;
type DemoTenant = {
  companyId: string;
  name: string;
  seededAt: string | null;
  seedVersion: string | null;
  expectedSeedVersion: string;
  ok: boolean;
  counts: DemoCounts;
  targets: DemoCounts;
  missing: Partial<DemoCounts>;
  members: Array<{ email: string | null; fullName: string | null }>;
};

function countText(value: number | undefined, target: number | undefined) {
  return `${value ?? 0}/${target ?? 0}`;
}

export function DemoMetricsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['demo-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('demo-metrics');
      if (error) throw error;
      return data as { tenants: DemoTenant[]; summary: { total: number; healthy: number; unhealthy: number } };
    },
    staleTime: 30_000,
  });

  const repair = useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke('repair-demo-tenant', { body: { companyId } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Demo tenant repaired');
      queryClient.invalidateQueries({ queryKey: ['demo-metrics'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Repair failed'),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading demo tenant status…</div>;
  }

  const tenants = data?.tenants ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Demo Tenant Status</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data?.summary.healthy ?? 0} healthy · {data?.summary.unhealthy ?? 0} need repair
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Deals</TableHead>
                <TableHead>Deal funding</TableHead>
                <TableHead>Calendar</TableHead>
                <TableHead>AI inbox</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No demo tenants found.</TableCell>
                </TableRow>
              ) : tenants.map((tenant) => {
                const missingKeys = Object.keys(tenant.missing ?? {});
                return (
                  <TableRow key={tenant.companyId}>
                    <TableCell>
                      <div className="font-medium">{tenant.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.seededAt ? `Seeded ${formatDistanceToNow(new Date(tenant.seededAt), { addSuffix: true })}` : 'Not seeded'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {tenant.ok ? (
                        <Badge variant="outline" className="gap-1 border-success/40 text-success">
                          <CheckCircle2 className="h-3 w-3" /> Healthy
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                          <AlertTriangle className="h-3 w-3" /> Missing {missingKeys.length}
                        </Badge>
                      )}
                      {missingKeys.length > 0 && (
                        <div className="mt-1 max-w-[180px] truncate text-[10px] text-muted-foreground" title={missingKeys.join(', ')}>
                          {missingKeys.join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{tenant.members.length}</TableCell>
                    <TableCell className="text-sm">{countText(tenant.counts.deals, tenant.targets.deals)}</TableCell>
                    <TableCell className="text-sm">{countText(tenant.counts.dealLenders, tenant.targets.dealLenders)}</TableCell>
                    <TableCell className="text-sm">{countText(tenant.counts.calendarEvents, tenant.targets.calendarEvents * Math.max(tenant.members.length, 1))}</TableCell>
                    <TableCell className="text-sm">{countText(tenant.counts.inboxEmails, tenant.targets.inboxEmails * Math.max(tenant.members.length, 1))}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={repair.isPending}
                        onClick={() => repair.mutate(tenant.companyId)}
                      >
                        {repair.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
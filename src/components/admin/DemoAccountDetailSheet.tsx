import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { Activity, Users as UsersIcon, Route, Sparkles, ListTree, Calendar } from "lucide-react";
import { useDemoAccountDetail, type DemoAccountRow } from "@/hooks/useDemoAccountMetrics";

interface Props {
  account: DemoAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StatusBadge = ({ s }: { s: DemoAccountRow['status'] }) => {
  const map: Record<DemoAccountRow['status'], string> = {
    active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    expired: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    revoked: "bg-red-500/20 text-red-400 border-red-500/30",
    converted: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  };
  return <Badge variant="outline" className={map[s]}>{s}</Badge>;
};

export function DemoAccountDetailSheet({ account, open, onOpenChange }: Props) {
  const { data, isLoading } = useDemoAccountDetail(account?.id ?? null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate">{account?.name ?? "Demo account"}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                <Badge variant="secondary">{account?.account_type ?? "Demo"}</Badge>
                {account && <StatusBadge s={account.status} />}
                {account?.created_at && (
                  <span className="text-muted-foreground">
                    Created {format(new Date(account.created_at), "MMM d, yyyy")}
                  </span>
                )}
                {account?.trial_ends_at && (
                  <span className="text-muted-foreground">
                    Trial {(() => {
                      const d = differenceInDays(new Date(account.trial_ends_at), new Date());
                      return d < 0 ? `expired ${Math.abs(d)}d ago` : `ends in ${d}d`;
                    })()}
                  </span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-4">
            {isLoading || !data ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <>
                {/* Top stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat icon={UsersIcon} label="Active users" value={data.account.distinct_active_users} />
                  <Stat icon={Activity} label="Sign-ins" value={data.account.sign_ins} />
                  <Stat icon={Calendar} label="Active days" value={data.account.distinct_active_days} />
                  <Stat icon={Sparkles} label="AI queries" value={data.account.ai_queries} />
                  <Stat icon={Route} label="Page views" value={data.account.page_views} />
                  <Stat icon={ListTree} label="Feature events" value={data.account.feature_events} />
                  <Stat icon={UsersIcon} label="Members" value={data.account.member_count} />
                  <Stat
                    icon={Activity}
                    label="Last active"
                    value={data.account.last_event_at
                      ? formatDistanceToNow(new Date(data.account.last_event_at), { addSuffix: true })
                      : "—"}
                  />
                </div>

                <Tabs defaultValue="users" className="space-y-3">
                  <TabsList>
                    <TabsTrigger value="users" className="gap-1.5">
                      <UsersIcon className="h-3.5 w-3.5" /> Users ({data.users.length})
                    </TabsTrigger>
                    <TabsTrigger value="routes" className="gap-1.5">
                      <Route className="h-3.5 w-3.5" /> Routes ({data.routes.length})
                    </TabsTrigger>
                    <TabsTrigger value="features" className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Features ({data.features.length})
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="gap-1.5">
                      <Activity className="h-3.5 w-3.5" /> Timeline
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="users" className="mt-0">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Logins</TableHead>
                            <TableHead className="text-right">Active days</TableHead>
                            <TableHead className="text-right">Events</TableHead>
                            <TableHead>First login</TableHead>
                            <TableHead>Last login</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.users.map((u) => (
                            <TableRow key={u.user_id}>
                              <TableCell>
                                <div className="font-medium text-sm">{u.display_name || "—"}</div>
                                <div className="text-xs text-muted-foreground">{u.email || u.user_id.slice(0, 8)}</div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{u.total_logins}</TableCell>
                              <TableCell className="text-right tabular-nums">{u.distinct_active_days}</TableCell>
                              <TableCell className="text-right tabular-nums">{u.total_events}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {u.first_login_at ? format(new Date(u.first_login_at), "MMM d, p") : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : "Never"}
                              </TableCell>
                            </TableRow>
                          ))}
                          {data.users.length === 0 && (
                            <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No users yet</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="routes" className="mt-0">
                    <UsageList items={data.routes.map(r => ({ key: r.path, count: r.count }))} emptyLabel="No page views recorded" />
                  </TabsContent>

                  <TabsContent value="features" className="mt-0">
                    <UsageList items={data.features.map(f => ({ key: f.feature, count: f.count }))} emptyLabel="No feature events recorded" />
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0 space-y-3">
                    {/* Heatmap-style daily bars */}
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground mb-2">Activity over last 30 days</div>
                      <div className="flex items-end gap-0.5 h-20">
                        {data.daily_activity.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No activity in last 30 days</div>
                        ) : (() => {
                          const max = Math.max(...data.daily_activity.map(d => d.count));
                          return data.daily_activity.map((d) => (
                            <div key={d.day} className="flex-1 min-w-[3px] bg-primary/60 rounded-sm hover:bg-primary transition-colors" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} title={`${d.day}: ${d.count} events`} />
                          ));
                        })()}
                      </div>
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.events.slice(0, 100).map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</TableCell>
                              <TableCell className="text-xs">{e.display_name || e.user_id.slice(0, 8)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[10px]">{e.event_type}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">
                                {(() => {
                                  const d = e.event_data || {};
                                  if (e.event_type === 'page_view') return d.path || d.route || d.url || '';
                                  if (e.event_type === 'feature_used') return d.feature || d.name || '';
                                  return Object.keys(d).length ? JSON.stringify(d).slice(0, 80) : '';
                                })()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

const Stat = ({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) => (
  <div className="rounded-md border bg-card/40 px-2.5 py-2">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" />{label}
    </div>
    <div className="text-base font-semibold tabular-nums mt-0.5 truncate">{typeof value === 'number' ? value.toLocaleString() : value}</div>
  </div>
);

const UsageList = ({ items, emptyLabel }: { items: Array<{ key: string; count: number }>; emptyLabel: string }) => {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">{emptyLabel}</div>;
  }
  const max = Math.max(...items.map(i => i.count));
  return (
    <div className="rounded-md border divide-y">
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-3 px-3 py-1.5 text-sm">
          <div className="flex-1 min-w-0">
            <div className="truncate font-mono text-xs">{i.key}</div>
            <div className="h-1 mt-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/70" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </div>
          <div className="tabular-nums text-xs text-muted-foreground w-12 text-right">{i.count}</div>
        </div>
      ))}
    </div>
  );
};

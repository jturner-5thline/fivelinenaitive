/**
 * Per-user drill-down sheet for Admin → All Users.
 *
 * Mirrors the DemoAccountDetailSheet pattern (KPI tiles + tabs for
 * Overview / Activity / Routes / Features / Objects) but scoped to a
 * single user_id via `useUserDetail`. Backed by the shared
 * `user_activity_log` event stream.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, Route, Sparkles, Calendar, LogIn, Eye, ListTree, Briefcase, Clock, Cloud, Globe, Home } from "lucide-react";
import { useUserDetail } from "@/hooks/useUserDetail";

interface AdminUser {
  user_id: string;
  id?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  source: 'local' | 'external' | 'flex';
  suspended_at?: string | null;
  created_at: string;
  _roles?: Array<{ id: string; role: string }>;
}

interface Props {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SourceBadge = ({ source }: { source: AdminUser['source'] }) => {
  if (source === 'flex') return <Badge variant="outline" className="gap-1"><Cloud className="h-3 w-3" />FLEx</Badge>;
  if (source === 'external') return <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />External</Badge>;
  return <Badge variant="secondary" className="gap-1"><Home className="h-3 w-3" />Local</Badge>;
};

export function UserDetailSheet({ user, open, onOpenChange }: Props) {
  const isFlex = user?.source === 'flex';
  const { data, isLoading } = useUserDetail(!isFlex && user ? user.user_id : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={user?.avatar_url || undefined} />
              <AvatarFallback>
                {user?.display_name?.[0] || user?.email?.[0] || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{user?.display_name || user?.email || "User"}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                {user && <SourceBadge source={user.source} />}
                {user?.suspended_at && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                {(user?._roles ?? []).map((r) => (
                  <Badge key={r.id} variant={r.role === 'admin' ? 'destructive' : 'secondary'} className="text-[10px]">{r.role}</Badge>
                ))}
                {user?.email && <span className="text-muted-foreground">{user.email}</span>}
                {user?.created_at && (
                  <span className="text-muted-foreground">· Joined {format(new Date(user.created_at), "MMM d, yyyy")}</span>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-4">
            {isFlex ? (
              <div className="rounded-md border bg-muted/30 px-4 py-6 text-sm text-muted-foreground space-y-2">
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <Cloud className="h-4 w-4" /> FLEx-imported reference profile
                </div>
                <p>
                  This profile was synced from FLEx and does not have Naitive login
                  access. No Naitive usage activity is tracked for FLEx profiles.
                </p>
                <div className="pt-3 grid grid-cols-2 gap-2 text-xs">
                  <Field label="Name" value={user?.display_name || '—'} />
                  <Field label="Full name" value={[user?.first_name, user?.last_name].filter(Boolean).join(' ') || '—'} />
                  <Field label="Email" value={user?.email || '—'} />
                  <Field label="Profile ID" value={user?.user_id || '—'} mono />
                </div>
              </div>
            ) : isLoading || !data ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <>
                {/* KPI tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat icon={LogIn} label="Sign-ins" value={data.kpis.total_sign_ins} />
                  <Stat icon={Calendar} label="Active days" value={data.kpis.distinct_active_days} />
                  <Stat icon={Activity} label="Total events" value={data.kpis.total_events} />
                  <Stat
                    icon={Clock}
                    label="Last active"
                    value={data.kpis.last_login_at
                      ? formatDistanceToNow(new Date(data.kpis.last_login_at), { addSuffix: true })
                      : (data.events[0]?.created_at
                          ? formatDistanceToNow(new Date(data.events[0].created_at), { addSuffix: true })
                          : "—")}
                  />
                  <Stat icon={Eye} label="Page views" value={data.kpis.page_views} />
                  <Stat icon={ListTree} label="Feature events" value={data.kpis.feature_events} />
                  <Stat icon={Sparkles} label="AI queries" value={data.kpis.ai_queries} />
                  <Stat icon={Briefcase} label="Deals touched" value={data.kpis.deals_touched} />
                </div>

                <Tabs defaultValue="overview" className="space-y-3">
                  <TabsList>
                    <TabsTrigger value="overview" className="gap-1.5">Overview</TabsTrigger>
                    <TabsTrigger value="activity" className="gap-1.5">
                      <Activity className="h-3.5 w-3.5" /> Activity
                    </TabsTrigger>
                    <TabsTrigger value="routes" className="gap-1.5">
                      <Route className="h-3.5 w-3.5" /> Routes ({data.routes.length})
                    </TabsTrigger>
                    <TabsTrigger value="features" className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Features ({data.features.length})
                    </TabsTrigger>
                    <TabsTrigger value="objects" className="gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" /> Objects ({data.objects.deals.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-0 space-y-3">
                    <div className="rounded-md border p-3 grid grid-cols-2 gap-3 text-xs">
                      <Field label="Name" value={user?.display_name || '—'} />
                      <Field label="Full name" value={[user?.first_name, user?.last_name].filter(Boolean).join(' ') || '—'} />
                      <Field label="Email" value={user?.email || '—'} />
                      <Field label="Source" value={user?.source === 'external' ? 'External Naitive collaborator' : 'Local Naitive account'} />
                      <Field label="Joined" value={user ? format(new Date(user.created_at), "PPP") : '—'} />
                      <Field label="Status" value={user?.suspended_at ? `Suspended ${formatDistanceToNow(new Date(user.suspended_at), { addSuffix: true })}` : 'Active'} />
                      <Field label="First login" value={data.kpis.first_login_at ? format(new Date(data.kpis.first_login_at), "PPp") : '—'} />
                      <Field label="Last login" value={data.kpis.last_login_at ? format(new Date(data.kpis.last_login_at), "PPp") : 'Never'} />
                      <Field label="Roles" value={(user?._roles ?? []).length === 0 ? 'No roles' : (user?._roles ?? []).map((r) => r.role).join(', ')} />
                      <Field label="User ID" value={user?.user_id || '—'} mono />
                    </div>
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
                  </TabsContent>

                  <TabsContent value="activity" className="mt-0">
                    {data.events.length === 0 ? (
                      <EmptyState label="No tracked activity yet for this user." />
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>When</TableHead>
                              <TableHead>Event</TableHead>
                              <TableHead>Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.events.slice(0, 100).map((e) => (
                              <TableRow key={e.id}>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px]">{e.event_type}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">
                                  {(() => {
                                    const d = e.event_data || {};
                                    if (e.event_type === 'page_view') return d.path || d.route || d.url || '';
                                    if (e.event_type === 'feature_used') return d.feature || d.name || '';
                                    return Object.keys(d).length ? JSON.stringify(d).slice(0, 100) : '';
                                  })()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="routes" className="mt-0">
                    <UsageList items={data.routes.map(r => ({ key: r.path, count: r.count }))} emptyLabel="No page views recorded" />
                  </TabsContent>

                  <TabsContent value="features" className="mt-0">
                    <UsageList items={data.features.map(f => ({ key: f.feature, count: f.count }))} emptyLabel="No feature events recorded" />
                  </TabsContent>

                  <TabsContent value="objects" className="mt-0">
                    {data.objects.deals.length === 0 ? (
                      <EmptyState label="No deals referenced in this user's activity." />
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Deal</TableHead>
                              <TableHead>Created</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.objects.deals.map((d) => (
                              <TableRow key={d.id}>
                                <TableCell className="text-sm">{d.name || d.id.slice(0, 8)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {d.created_at ? format(new Date(d.created_at), "MMM d, yyyy") : '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
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
    <div className="text-base font-semibold tabular-nums mt-0.5 truncate">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
  </div>
);

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-xs ${mono ? 'font-mono' : ''} truncate`}>{value}</div>
  </div>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">{label}</div>
);

const UsageList = ({ items, emptyLabel }: { items: Array<{ key: string; count: number }>; emptyLabel: string }) => {
  if (items.length === 0) {
    return <EmptyState label={emptyLabel} />;
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
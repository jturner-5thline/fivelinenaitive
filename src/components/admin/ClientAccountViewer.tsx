import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Search, User, Building2, Briefcase, Clock, Shield,
  ChevronRight, ArrowLeft, MonitorPlay, Activity, KeyRound, Ban, ListTodo,
  Plug, CheckCircle2, XCircle, Flag,
} from 'lucide-react';
import { useToggleUserSuspension } from '@/hooks/useAdminData';
import { toast } from 'sonner';
import { useAdminRole } from '@/hooks/useAdminRole';

interface UserResult {
  user_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  created_at: string;
  onboarding_completed: boolean | null;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
}

export function ClientAccountViewer() {
  const { isAdmin, isLoading: roleLoading } = useAdminRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => setDebouncedQuery(value.trim()), 300);
    setSearchTimeout(timeout);
  };

  // Companies list for filter
  const { data: companies } = useQuery({
    queryKey: ['admin-companies-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  // User IDs in selected company
  const { data: companyUserIds } = useQuery({
    queryKey: ['admin-company-user-ids', companyFilter],
    queryFn: async () => {
      if (companyFilter === 'all') return null;
      const { data, error } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', companyFilter);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.user_id);
    },
    enabled: isAdmin && companyFilter !== 'all',
  });

  // Search users (optionally scoped to company)
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['admin-user-search', debouncedQuery, companyFilter, companyUserIds],
    queryFn: async () => {
      const hasQuery = debouncedQuery.length >= 2;
      const hasCompany = companyFilter !== 'all';
      if (!hasQuery && !hasCompany) return [];
      let q = supabase
        .from('profiles')
        .select('user_id, email, display_name, first_name, last_name, avatar_url, created_at, onboarding_completed, approved_at, suspended_at, suspended_reason')
        .order('created_at', { ascending: false })
        .limit(50);
      if (hasQuery) {
        const pattern = `%${debouncedQuery}%`;
        q = q.or(`display_name.ilike.${pattern},email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`);
      }
      if (hasCompany) {
        if (!companyUserIds || companyUserIds.length === 0) return [];
        q = q.in('user_id', companyUserIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UserResult[];
    },
    enabled: isAdmin && (debouncedQuery.length >= 2 || (companyFilter !== 'all' && !!companyUserIds)),
  });

  if (roleLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Admin access required.</p>
        </CardContent>
      </Card>
    );
  }

  if (selectedUserId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to search
        </Button>
        <UserDetailView userId={selectedUserId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5" />
            Client Account Viewer
          </CardTitle>
          <CardDescription>
            Search for any user by name or email to view their account details, company, and deals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Select user (search by name or email)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Filter by company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {(companies ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {searchLoading && (
        <Card>
          <CardContent className="py-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {!searchLoading && searchResults && searchResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {searchResults.map((user) => (
              <button
                key={user.user_id}
                onClick={() => setSelectedUserId(user.user_id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.avatar_url ?? undefined} />
                  <AvatarFallback>{(user.display_name ?? user.email ?? '?')[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.display_name ?? 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {user.suspended_at && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
                  {!user.approved_at && !user.suspended_at && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {!searchLoading && debouncedQuery.length >= 2 && searchResults?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No users found matching "{debouncedQuery}"</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── User Detail View ───────────────────────────────────────────────
function UserDetailView({ userId }: { userId: string }) {
  const toggleSuspension = useToggleUserSuspension();
  const [resetting, setResetting] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Company membership
  const { data: membership } = useQuery({
    queryKey: ['admin-user-company', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_members')
        .select('role, company_id, companies(name, industry, logo_url, employee_size, created_at)')
        .eq('user_id', userId)
        .limit(5);
      if (error) throw error;
      return data as Array<{
        role: string;
        company_id: string;
        companies: { name: string; industry: string | null; logo_url: string | null; employee_size: string | null; created_at: string } | null;
      }>;
    },
  });

  const primaryCompanyId = membership?.[0]?.company_id ?? null;
  const primaryCompanyName = membership?.[0]?.companies?.name ?? null;
  const primaryRole = membership?.[0]?.role ?? null;

  // Deals summary
  const { data: deals } = useQuery({
    queryKey: ['admin-user-deals', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, stage, status, value, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent usage events
  const { data: usageEvents } = useQuery({
    queryKey: ['admin-user-usage', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_events')
        .select('id, feature_type, feature_subtype, timestamp, deal_id')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lastActivity = usageEvents?.[0]?.timestamp ?? null;

  // Integrations
  const { data: integrations } = useQuery({
    queryKey: ['admin-user-integrations', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('name, type, status, last_sync_at')
        .eq('user_id', userId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: gmailToken } = useQuery({
    queryKey: ['admin-user-gmail', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('gmail_tokens')
        .select('user_id, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },
  });

  // Open tasks assigned to user
  const { data: openTasks } = useQuery({
    queryKey: ['admin-user-tasks', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, deal_id')
        .eq('assigned_to', userId)
        .neq('status', 'completed')
        .is('archived_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Feature flags active for the user's company
  const { data: featureFlags } = useQuery({
    queryKey: ['admin-user-flags', userId, primaryCompanyId],
    queryFn: async () => {
      const { data: flags, error } = await supabase
        .from('feature_flags')
        .select('id, name, description, status, is_beta')
        .neq('status', 'disabled');
      if (error) throw error;
      return flags ?? [];
    },
    enabled: !!profile,
  });

  const handleResetPassword = async () => {
    if (!profile?.email) return;
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${profile.email}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reset email');
    } finally {
      setResetting(false);
    }
  };

  const handleDeactivate = () => {
    if (!profile) return;
    const isSuspended = !!profile.suspended_at;
    toggleSuspension.mutate(
      { userId: profile.user_id, suspend: !isSuspended, reason: suspendReason || undefined },
      {
        onSuccess: () => {
          setDeactivateOpen(false);
          setSuspendReason('');
        },
      },
    );
  };

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">User not found.</p>
        </CardContent>
      </Card>
    );
  }

  const statusBadge = profile.suspended_at
    ? <Badge variant="destructive">Suspended</Badge>
    : profile.approved_at
      ? <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10">Active</Badge>
      : <Badge variant="secondary">Invited</Badge>;

  const integrationStatus = (type: string) => {
    const found = (integrations ?? []).find(
      (i: any) => (i.type || '').toLowerCase().includes(type) || (i.name || '').toLowerCase().includes(type),
    );
    if (type === 'gmail' && gmailToken) return { connected: true, last: gmailToken.updated_at };
    if (found) return { connected: (found as any).status === 'connected', last: (found as any).last_sync_at };
    return { connected: false, last: null };
  };

  const gmail = integrationStatus('gmail');
  const asana = integrationStatus('asana');
  const hubspot = integrationStatus('hubspot');

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={profile.avatar_url ?? undefined} />
                <AvatarFallback className="text-lg">{(profile.display_name ?? '?')[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle>{profile.display_name ?? 'Unnamed User'}</CardTitle>
                  {statusBadge}
                  {primaryRole && (
                    <Badge variant="outline" className="capitalize">{primaryRole}</Badge>
                  )}
                </div>
                <CardDescription className="mt-1">{profile.email}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleResetPassword} disabled={resetting || !profile.email}>
                <KeyRound className="h-4 w-4 mr-1.5" />
                {resetting ? 'Sending…' : 'Reset Password'}
              </Button>
              <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant={profile.suspended_at ? 'outline' : 'destructive'} size="sm">
                    <Ban className="h-4 w-4 mr-1.5" />
                    {profile.suspended_at ? 'Reactivate' : 'Deactivate'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {profile.suspended_at ? 'Reactivate this user?' : 'Deactivate this user?'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {profile.suspended_at
                        ? `${profile.display_name ?? profile.email} will regain access to the platform.`
                        : `${profile.display_name ?? profile.email} will no longer be able to sign in to naitive.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {!profile.suspended_at && (
                    <Input
                      placeholder="Reason (optional)"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                    />
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => { e.preventDefault(); handleDeactivate(); }}
                      disabled={toggleSuspension.isPending}
                    >
                      {profile.suspended_at ? 'Reactivate' : 'Deactivate'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <InfoItem icon={Building2} label="Company" value={primaryCompanyName} />
            <InfoItem icon={Shield} label="Role" value={primaryRole} />
            <InfoItem icon={Clock} label="Last Activity" value={lastActivity ? `${formatDistanceToNow(new Date(lastActivity))} ago` : 'Never'} />
            <InfoItem icon={Clock} label="Joined" value={profile.created_at ? format(new Date(profile.created_at), 'MMM d, yyyy') : null} />
          </div>
          {profile.suspended_at && profile.suspended_reason && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm">
              <strong>Suspension reason:</strong> {profile.suspended_reason}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Integrations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Active Integrations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <IntegrationRow name="Gmail" connected={gmail.connected} last={gmail.last} />
            <IntegrationRow name="Asana" connected={asana.connected} last={asana.last} />
            <IntegrationRow name="HubSpot" connected={hubspot.connected} last={hubspot.last} />
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Active Feature Flags ({featureFlags?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!featureFlags || featureFlags.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">No feature flags enabled.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {featureFlags.map((f: any) => (
                <Badge key={f.id} variant={f.is_beta ? 'secondary' : 'outline'} className="text-xs">
                  {f.name}{f.is_beta ? ' · beta' : ''}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Info */}
      {membership && membership.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Membership
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {membership.map((m) => (
              <div key={m.company_id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                {m.companies?.logo_url ? (
                  <img src={m.companies.logo_url} alt="" className="h-8 w-8 rounded object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.companies?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    {[m.companies?.industry, m.companies?.employee_size].filter(Boolean).join(' · ') || 'No details'}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize text-xs">{m.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Open Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Open Tasks ({openTasks?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!openTasks || openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open tasks assigned.</p>
          ) : (
            <div className="space-y-2">
              {openTasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.due_date ? `Due ${format(new Date(t.due_date), 'MMM d, yyyy')}` : 'No due date'}
                      {' · '}<span className="capitalize">{t.priority}</span>
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{(t.status ?? '').replace(/_/g, ' ')}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deals Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Deals Managed ({deals?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!deals || deals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deals found for this user.</p>
          ) : (
            <div className="space-y-2">
              {deals.map((deal) => (
                <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-sm">
                  <div>
                    <p className="font-medium">{deal.company || 'Untitled Deal'}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(deal.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {deal.value != null && (
                      <span className="text-xs text-muted-foreground">
                        ${Number(deal.value).toLocaleString()}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs capitalize">{deal.status ?? 'active'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity (last 10 usage events) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Actions (last 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!usageEvents || usageEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent activity recorded.</p>
          ) : (
            <div className="space-y-2">
              {usageEvents.map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 p-2 text-sm">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm capitalize">
                      {ev.feature_type.replace(/_/g, ' ')}
                      {ev.feature_subtype && <span className="text-muted-foreground"> · {ev.feature_subtype}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.timestamp), 'MMM d, yyyy · HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationRow({ name, connected, last }: { name: string; connected: boolean; last: string | null }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
      {connected ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {connected
            ? last ? `Synced ${formatDistanceToNow(new Date(last))} ago` : 'Connected'
            : 'Not connected'}
        </p>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-medium text-sm">{value || '—'}</p>
    </div>
  );
}

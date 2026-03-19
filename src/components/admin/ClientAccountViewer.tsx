import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Search, User, Building2, Briefcase, Clock, Mail, Shield,
  ChevronRight, ArrowLeft, MonitorPlay, Activity,
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => setDebouncedQuery(value.trim()), 300);
    setSearchTimeout(timeout);
  };

  // Search users
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['admin-user-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const pattern = `%${debouncedQuery}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, email, display_name, first_name, last_name, avatar_url, created_at, onboarding_completed, approved_at, suspended_at, suspended_reason')
        .or(`display_name.ilike.${pattern},email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as UserResult[];
    },
    enabled: debouncedQuery.length >= 2,
  });

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
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
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

  // Recent activity
  const { data: activity } = useQuery({
    queryKey: ['admin-user-activity', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, activity_type, description, created_at, deal_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

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
      : <Badge variant="secondary">Pending Approval</Badge>;

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="text-lg">{(profile.display_name ?? '?')[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <CardTitle>{profile.display_name ?? 'Unnamed User'}</CardTitle>
                {statusBadge}
              </div>
              <CardDescription className="mt-1">{profile.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <InfoItem icon={User} label="First Name" value={profile.first_name} />
            <InfoItem icon={User} label="Last Name" value={profile.last_name} />
            <InfoItem icon={Clock} label="Joined" value={profile.created_at ? format(new Date(profile.created_at), 'MMM d, yyyy') : null} />
            <InfoItem icon={Shield} label="Onboarded" value={profile.onboarding_completed ? 'Yes' : 'No'} />
          </div>
          {profile.suspended_at && profile.suspended_reason && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm">
              <strong>Suspension reason:</strong> {profile.suspended_reason}
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

      {/* Deals Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Deals ({deals?.length ?? 0})
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

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!activity || activity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent activity.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {activity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-2 text-sm">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{log.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, yyyy · HH:mm')}
                      {' · '}
                      <span className="capitalize">{log.activity_type.replace(/_/g, ' ')}</span>
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

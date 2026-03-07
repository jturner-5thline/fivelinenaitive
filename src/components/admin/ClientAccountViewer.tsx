import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useSupportSession } from '@/hooks/useSupportSession';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, Pencil, ExternalLink, Shield, MonitorPlay, LogOut, Settings, ClipboardList, Layout } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyConfigOverview } from './CompanyConfigOverview';
import { CompanyPageAccessPanel } from './CompanyPageAccessPanel';

interface AuditLogEntry {
  id: string;
  support_user_id: string;
  target_company_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ProfileInfo {
  display_name: string | null;
  email: string | null;
}

// Map action to human-readable event label
function formatEvent(action: string, resourceType: string): string {
  const verb = action.startsWith('view_') ? 'Viewed'
    : action.startsWith('create_') ? 'Created'
    : action.startsWith('update_') ? 'Updated'
    : action.startsWith('delete_') ? 'Deleted'
    : action.charAt(0).toUpperCase() + action.slice(1);

  const noun = resourceType.replace(/_/g, ' ');
  return `${verb} ${noun}`;
}

// Determine if an action is a read or write
function isWriteAction(action: string): boolean {
  return action.startsWith('create_') || action.startsWith('update_') || action.startsWith('delete_');
}

// Get route for a resource
function getResourceRoute(resourceType: string, resourceId: string | null): string | null {
  if (!resourceId) return null;
  switch (resourceType) {
    case 'deal': return `/deals/${resourceId}`;
    case 'workflow': return `/workflows/${resourceId}`;
    case 'integration': case 'integration_config': return `/integrations/${resourceId}`;
    case 'agent': return `/agents/${resourceId}`;
    case 'config': case 'settings': return `/settings`;
    default: return null;
  }
}

type EventFilter = 'all' | 'edits' | 'views';
type TimeFilter = '24h' | '7d' | '30d';

export function ClientAccountViewer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { canUseSupport, activeSession, companyName, startSession, endSession } = useSupportSession();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');

  // Fetch all companies for the selector
  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['admin-all-companies-support'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_all_companies');
      if (error) throw error;
      return data as Array<{ id: string; name: string; member_count: number }>;
    },
    enabled: canUseSupport,
  });

  // Set selected company from active session
  useEffect(() => {
    if (activeSession?.target_company_id && !selectedCompanyId) {
      setSelectedCompanyId(activeSession.target_company_id);
    }
  }, [activeSession?.target_company_id, selectedCompanyId]);

  const targetCompanyId = activeSession?.target_company_id || selectedCompanyId;

  // Compute time cutoff
  const getTimeCutoff = () => {
    const now = new Date();
    switch (timeFilter) {
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  // Fetch audit logs
  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['support-audit-logs', targetCompanyId, timeFilter],
    queryFn: async () => {
      if (!targetCompanyId) return [];
      const cutoff = getTimeCutoff();
      const { data, error } = await supabase
        .from('support_audit_logs')
        .select('*')
        .eq('target_company_id', targetCompanyId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Error fetching audit logs:', error);
        return [];
      }
      return data as AuditLogEntry[];
    },
    enabled: canUseSupport && !!targetCompanyId,
    refetchInterval: 30_000,
  });

  // Fetch profiles for support users in audit logs
  const supportUserIds = [...new Set((auditLogs ?? []).map(l => l.support_user_id))];
  const { data: profilesMap } = useQuery({
    queryKey: ['support-user-profiles', supportUserIds.join(',')],
    queryFn: async () => {
      if (supportUserIds.length === 0) return {} as Record<string, ProfileInfo>;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .in('user_id', supportUserIds);
      const map: Record<string, ProfileInfo> = {};
      (data ?? []).forEach(p => { map[p.user_id] = p; });
      return map;
    },
    enabled: supportUserIds.length > 0,
  });

  // Apply event filter
  const filteredLogs = (auditLogs ?? []).filter(log => {
    if (eventFilter === 'edits') return isWriteAction(log.action);
    if (eventFilter === 'views') return !isWriteAction(log.action);
    return true;
  });

  const handleStartSession = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    await startSession(selectedCompanyId);
    toast.success('Support session started');
  };

  const handleEndSession = async () => {
    await endSession();
    toast.success('Support session ended');
  };

  const handleViewResource = (resourceType: string, resourceId: string | null) => {
    if (!activeSession) {
      toast.error('Start a support session to view resources in client context');
      return;
    }
    const route = getResourceRoute(resourceType, resourceId);
    if (route) {
      navigate(route);
    } else {
      toast.error('No direct link available for this resource type');
    }
  };

  if (!canUseSupport) return null;

  return (
    <div className="space-y-6">
      {/* Support Mode Banner */}
      {activeSession && companyName && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-3">
            <MonitorPlay className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm">
              You are viewing naitive as <strong>{companyName}</strong> – internal 5th Line support mode (full edit access).
              All support views and edits in this client account are logged with your user id and timestamp.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleEndSession} className="shrink-0">
            <LogOut className="h-4 w-4 mr-1" />
            Exit support mode
          </Button>
        </div>
      )}

      {/* Company Selector & Session Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Client Account Viewer
          </CardTitle>
          <CardDescription>
            View and manage client accounts in support mode. All actions are logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="grid gap-1.5 flex-1 max-w-sm">
              <label className="text-sm font-medium">Select Company</label>
              <Select
                value={selectedCompanyId}
                onValueChange={setSelectedCompanyId}
                disabled={!!activeSession}
              >
                <SelectTrigger>
                  <SelectValue placeholder={companiesLoading ? 'Loading...' : 'Choose a company'} />
                </SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.member_count} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeSession ? (
              <Button variant="outline" onClick={handleEndSession}>
                <LogOut className="h-4 w-4 mr-1" />
                End Session
              </Button>
            ) : (
              <Button onClick={handleStartSession} disabled={!selectedCompanyId}>
                <MonitorPlay className="h-4 w-4 mr-1" />
                View as Client
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabbed content: Config Overview + Activity Log */}
      {targetCompanyId && (
        <Tabs defaultValue="config" className="space-y-4">
          <TabsList>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="page-access" className="gap-2">
              <Layout className="h-4 w-4" />
              Page Access
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Activity Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Company Configuration</CardTitle>
                <CardDescription>All settings, integrations, members, preferences, and custom metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <CompanyConfigOverview companyId={targetCompanyId} editable={!!activeSession} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="page-access">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Page & Feature Access</CardTitle>
                <CardDescription>Control which pages and features are available for this company</CardDescription>
              </CardHeader>
              <CardContent>
                <CompanyPageAccessPanel companyId={targetCompanyId} editable={!!activeSession} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Support Activity Log</CardTitle>
                    <CardDescription>All support actions for this client account</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as EventFilter)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All events</SelectItem>
                        <SelectItem value="edits">Edits only</SelectItem>
                        <SelectItem value="views">Views only</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No support activity found for the selected filters.
                  </p>
                ) : (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Support User</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Resource</TableHead>
                          <TableHead className="w-[80px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map(log => {
                          const profile = profilesMap?.[log.support_user_id];
                          const route = getResourceRoute(log.resource_type, log.resource_id);
                          const isWrite = isWriteAction(log.action);

                          return (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">{profile?.display_name ?? 'Unknown'}</div>
                                <div className="text-xs text-muted-foreground">{profile?.email ?? ''}</div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge variant={isWrite ? 'destructive' : 'secondary'} className="text-xs">
                                    {isWrite ? <Pencil className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                                    {isWrite ? 'Edit' : 'View'}
                                  </Badge>
                                  <span className="text-sm">{formatEvent(log.action, log.resource_type)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm capitalize">{log.resource_type.replace(/_/g, ' ')}</span>
                                {log.resource_id && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({log.resource_id.slice(0, 8)}…)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {route && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewResource(log.resource_type, log.resource_id)}
                                    disabled={!activeSession}
                                    title={activeSession ? 'View in client context' : 'Start a session first'}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

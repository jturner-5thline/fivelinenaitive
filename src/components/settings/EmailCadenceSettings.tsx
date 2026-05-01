import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, RefreshCw, Clock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CadenceJob {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  contacts_processed: number;
  messages_scanned: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface CadenceProfilePreview {
  contact_email: string;
  contact_name: string | null;
  avg_followup_interval_days: number | null;
  outbound_count: number;
  last_contact_at: string | null;
  relationship_type: string | null;
}

/**
 * Settings → Email → "Learn My Cadence". On-demand only — never scheduled.
 * Triggers the `learn-email-cadence` edge function which scans the user's
 * cached Gmail history (180 days) and builds a per-contact cadence profile.
 * The output is consumed by the email AI panel for follow-up nudges and
 * tone-matched drafts.
 */
export function EmailCadenceSettings() {
  const { user } = useAuth();
  const [job, setJob] = useState<CadenceJob | null>(null);
  const [running, setRunning] = useState(false);
  const [previews, setPreviews] = useState<CadenceProfilePreview[]>([]);
  const [profileCount, setProfileCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [{ data: jobs }, { count }, { data: top }] = await Promise.all([
      supabase
        .from('email_cadence_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('email_cadence_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('email_cadence_profiles')
        .select('contact_email, contact_name, avg_followup_interval_days, outbound_count, last_contact_at, relationship_type')
        .eq('user_id', user.id)
        .order('outbound_count', { ascending: false })
        .limit(8),
    ]);
    setJob((jobs?.[0] as CadenceJob | undefined) ?? null);
    setProfileCount(count ?? 0);
    setPreviews((top as CadenceProfilePreview[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const runScan = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('learn-email-cadence');
      if (error) throw error;
      const out = data as { contactsProcessed?: number; messagesScanned?: number; error?: string };
      if (out?.error) throw new Error(out.error);
      toast.success(
        `Cadence learned for ${out?.contactsProcessed ?? 0} contacts (${out?.messagesScanned ?? 0} messages scanned).`,
      );
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to run cadence scan');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
          Learn My Cadence
        </CardTitle>
        <CardDescription>
          Scan your inbox + sent mail to learn how often you typically follow up
          with each contact, your average response time, and the tone you use
          per relationship type. Runs on demand only — nothing is sent or
          shared. The AI panel uses this to nudge follow-ups and match your
          voice in drafts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runScan} disabled={running} size="sm" className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {profileCount > 0 ? 'Re-scan now' : 'Scan my inbox'}
          </Button>
          {loading ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : job ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={job.status === 'done' ? 'secondary' : job.status === 'error' ? 'destructive' : 'outline'} className="gap-1">
                <Clock className="h-3 w-3" />
                Last scan: {formatDistanceToNow(new Date(job.finished_at || job.created_at), { addSuffix: true })}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {profileCount} contacts learned
              </Badge>
              {job.status === 'error' && job.error_message && (
                <span className="text-destructive text-xs">{job.error_message}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Never run yet.</span>
          )}
        </div>

        {previews.length > 0 && (
          <div className="rounded-md border border-border/40 overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Top contacts by volume
            </div>
            <div className="divide-y divide-border/40">
              {previews.map((p) => (
                <div key={p.contact_email} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center">
                  <div className="col-span-5 truncate">
                    <div className="font-medium truncate">{p.contact_name || p.contact_email}</div>
                    {p.contact_name && (
                      <div className="text-[10px] text-muted-foreground truncate">{p.contact_email}</div>
                    )}
                  </div>
                  <div className="col-span-2 text-muted-foreground">
                    {p.relationship_type || '—'}
                  </div>
                  <div className="col-span-2 text-muted-foreground">
                    {p.outbound_count} sent
                  </div>
                  <div className="col-span-3 text-right">
                    {p.avg_followup_interval_days != null ? (
                      <span>
                        every <strong>{Number(p.avg_followup_interval_days).toFixed(1)}</strong> days
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
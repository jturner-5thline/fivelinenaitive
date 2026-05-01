import { useEffect, useState } from 'react';
import { Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CadenceProfile {
  contact_email: string;
  contact_name: string | null;
  avg_followup_interval_days: number | null;
  median_followup_interval_days: number | null;
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  outbound_count: number;
  tone: { formality?: string; common_greeting?: string | null } | null;
  relationship_type: string | null;
}

interface Props {
  /** Sender email of the latest message in the thread. */
  contactEmail: string | undefined | null;
  /** Display name of the contact, used in the nudge copy. */
  contactName?: string | null;
  /** Triggers the existing draft flow when the user accepts the nudge. */
  onDraftFollowUp?: () => void;
}

/**
 * Surfaces a cadence-based follow-up nudge in the email AI panel.
 *
 * Renders only when:
 *  1. A cadence profile exists for the sender (built via Settings →
 *     Email → Learn My Cadence).
 *  2. The user has actually established a cadence (≥3 outbound messages
 *     and a known average interval).
 *  3. The user is overdue — i.e. days-since-last-outbound exceeds the
 *     contact's average follow-up interval.
 *
 * If the user is on-cadence we still render a low-key info chip so the
 * AI panel exposes the learned interval (the cadence data is also fed
 * into smart-email-ai for tone-matched drafts).
 */
export function CadenceInsightCard({ contactEmail, contactName, onDraftFollowUp }: Props) {
  const [profile, setProfile] = useState<CadenceProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!contactEmail) {
        setProfile(null);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from('email_cadence_profiles')
        .select(
          'contact_email, contact_name, avg_followup_interval_days, median_followup_interval_days, last_outbound_at, last_inbound_at, outbound_count, tone, relationship_type',
        )
        .eq('contact_email', contactEmail.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      setProfile((data as CadenceProfile | null) ?? null);
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [contactEmail]);

  if (loading || !profile) return null;

  const avg = profile.avg_followup_interval_days ?? null;
  if (avg == null || profile.outbound_count < 3) return null;

  const lastOut = profile.last_outbound_at ? new Date(profile.last_outbound_at).getTime() : null;
  const daysSince = lastOut != null ? (Date.now() - lastOut) / 86400000 : null;
  const overdue = daysSince != null && daysSince > Number(avg) * 1.2;

  const niceName = contactName || profile.contact_name || profile.contact_email;
  const avgRounded = Number(avg).toFixed(Number(avg) >= 10 ? 0 : 1);

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 text-xs space-y-2',
        overdue
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border/50 bg-muted/20',
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className={cn(
            'h-3.5 w-3.5 mt-0.5 shrink-0',
            overdue ? 'text-amber-500' : 'text-[hsl(var(--outlook-blue))]',
          )}
        />
        <div className="flex-1 leading-relaxed">
          <span className="font-medium">
            You typically follow up with {niceName} every {avgRounded} day{Number(avgRounded) === 1 ? '' : 's'}.
          </span>{' '}
          {daysSince != null && (
            overdue ? (
              <span className="text-amber-700 dark:text-amber-400">
                It's been {Math.round(daysSince)} days — overdue.
              </span>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last reached out {Math.round(daysSince)} day{Math.round(daysSince) === 1 ? '' : 's'} ago.
              </span>
            )
          )}
        </div>
      </div>
      {overdue && onDraftFollowUp && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={onDraftFollowUp}
          >
            <Sparkles className="h-3 w-3" />
            Draft a follow-up
          </Button>
        </div>
      )}
    </div>
  );
}
/**
 * ScheduleConfirm — public page reached by clicking a slot link the
 * sender inserted into an outgoing email. Looks up the slot by token,
 * lets the recipient confirm, and triggers the calendar booking on the
 * proposer's account.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';

interface SlotInfo {
  slot_start: string;
  slot_end: string;
  status: 'proposed' | 'accepted' | 'expired' | 'cancelled';
  subject: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  timezone: string | null;
  expired: boolean;
  in_past: boolean;
}

function fmtRange(startISO: string, endISO: string, tz?: string | null): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: tz || undefined,
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: tz || undefined,
  });
  const tzFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz || undefined, timeZoneName: 'short',
  }).formatToParts(start).find((p) => p.type === 'timeZoneName')?.value || '';
  return `${dayFmt.format(start)} \u00b7 ${timeFmt.format(start)} \u2013 ${timeFmt.format(end)} ${tzFmt}`;
}

export default function ScheduleConfirm() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<SlotInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<{ subject: string; range: string } | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) { setError('missing_token'); setLoading(false); return; }
    (async () => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('confirm-meeting-slot', {
          body: { token, action: 'lookup' },
        });
        if (!active) return;
        if (invokeErr) { setError(invokeErr.message); return; }
        if (data?.error) { setError(data.error); return; }
        setSlot(data?.slot ?? null);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  const onConfirm = async () => {
    if (!slot) return;
    setConfirming(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('confirm-meeting-slot', {
        body: { token, action: 'confirm' },
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      setConfirmed({
        subject: data?.slot?.subject || 'Meeting',
        range: fmtRange(data?.slot?.slot_start, data?.slot?.slot_end, data?.slot?.timezone),
      });
    } catch (e) {
      setError((e as Error).message || 'Booking failed');
    } finally {
      setConfirming(false);
    }
  };

  const unavailable = slot && (
    slot.status !== 'proposed' || slot.expired || slot.in_past
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Helmet>
        <title>Confirm meeting time</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Confirm meeting time</h1>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
          </div>
        )}

        {!loading && error && !slot && (
          <div className="flex items-start gap-2 text-sm text-destructive py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              {error === 'not_found' && 'This booking link is invalid or has been removed.'}
              {error === 'missing_token' && 'No booking token provided.'}
              {!['not_found','missing_token'].includes(error) && error}
            </div>
          </div>
        )}

        {!loading && slot && !confirmed && (
          <div className="space-y-4">
            {slot.subject && (
              <p className="text-sm text-muted-foreground">{slot.subject}</p>
            )}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="text-base font-medium">
                {fmtRange(slot.slot_start, slot.slot_end, slot.timezone)}
              </div>
            </div>

            {unavailable && (
              <div className="flex items-start gap-2 text-sm text-amber-500/90 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  This time is no longer available. Please reply to the original
                  email to request another time.
                </div>
              </div>
            )}

            {!unavailable && (
              <>
                {error && (
                  <div className="text-xs text-destructive">{error}</div>
                )}
                <Button
                  className="w-full"
                  disabled={confirming}
                  onClick={onConfirm}
                >
                  {confirming ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Booking…</>
                  ) : 'Confirm this time'}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  A calendar invite will be sent to you once confirmed.
                </p>
              </>
            )}
          </div>
        )}

        {confirmed && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">You're booked!</span>
            </div>
            <p className="text-sm">{confirmed.subject}</p>
            <p className="text-sm text-muted-foreground">{confirmed.range}</p>
            <p className="text-xs text-muted-foreground pt-2">
              A calendar invite has been sent to your inbox.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
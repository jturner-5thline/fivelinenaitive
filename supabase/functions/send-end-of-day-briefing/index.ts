import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { template as eodTemplate } from '../_shared/transactional-email-templates/end-of-day-briefing-ready.tsx'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const SITE_NAME = "naitive"
const SENDER_DOMAIN = "notify.noreply.naitive.co"
const FROM_DOMAIN = "noreply.naitive.co"

const ELIGIBLE_EMAILS = [
  'jturner@5thline.co',
  'nheikali@5thline.co',
  'ppina@5thline.co',
  'ffustinoni@5thline.co',
]

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Returns { dateStr (YYYY-MM-DD), hour (0-23), weekday (0=Sun..6=Sat) } for the given timezone.
function localParts(now: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false, weekday: 'short',
    })
    const parts = fmt.formatToParts(now)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return {
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
      hour: parseInt(get('hour'), 10),
      weekday: weekdayMap[get('weekday')] ?? 0,
    }
  } catch {
    return localParts(now, 'America/New_York')
  }
}

function isSameLocalDay(iso: string | null | undefined, tz: string, dateStr: string): boolean {
  if (!iso) return false
  return localParts(new Date(iso), tz).dateStr === dateStr
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now = new Date()

    // Load profiles for the eligible audience.
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('user_id, email, first_name, full_name, timezone, last_eod_rundown_email_sent_at')
      .in('email', ELIGIBLE_EMAILS)
    if (profErr) throw profErr

    const results: Array<{ email: string; outcome: string; reason?: string }> = []

    for (const p of profiles ?? []) {
      const email = (p.email ?? '').toLowerCase()
      if (!email) { results.push({ email, outcome: 'skip', reason: 'no_email' }); continue }
      const tz = p.timezone || 'America/New_York'
      const { dateStr, hour, weekday } = localParts(now, tz)

      // Weekday-only (Mon-Fri).
      if (weekday < 1 || weekday > 5) {
        results.push({ email, outcome: 'skip', reason: 'weekend' })
        continue
      }
      // 6 PM local hour exactly (cron runs every 15min within the 18:00 hour).
      if (hour !== 18) {
        results.push({ email, outcome: 'skip', reason: `local_hour_${hour}` })
        continue
      }
      // Federal/business holiday (date evaluated in user's local tz).
      const { data: holiday } = await supabase
        .from('business_holidays')
        .select('id')
        .eq('holiday_date', dateStr)
        .eq('is_active', true)
        .maybeSingle()
      if (holiday) {
        results.push({ email, outcome: 'skip', reason: 'holiday' })
        continue
      }
      // Already sent today?
      if (isSameLocalDay(p.last_eod_rundown_email_sent_at as any, tz, dateStr)) {
        results.push({ email, outcome: 'skip', reason: 'already_sent_today' })
        continue
      }

      // Suppression check.
      const { data: suppressed } = await supabase
        .from('suppressed_emails')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (suppressed) {
        results.push({ email, outcome: 'skip', reason: 'suppressed' })
        continue
      }

      // Reserve the slot first to prevent double-send across overlapping cron runs.
      const nowIso = new Date().toISOString()
      const { error: reserveErr } = await supabase
        .from('profiles')
        .update({ last_eod_rundown_email_sent_at: nowIso } as any)
        .eq('user_id', p.user_id)
      if (reserveErr) {
        results.push({ email, outcome: 'error', reason: 'reserve_failed' })
        continue
      }

      // Unsubscribe token.
      let unsubscribeToken = ''
      const { data: existingToken } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token, used_at')
        .eq('email', email)
        .maybeSingle()
      if (existingToken?.used_at) {
        results.push({ email, outcome: 'skip', reason: 'unsubscribed' })
        continue
      }
      if (existingToken?.token) {
        unsubscribeToken = existingToken.token
      } else {
        unsubscribeToken = generateToken()
        await supabase
          .from('email_unsubscribe_tokens')
          .upsert(
            { token: unsubscribeToken, email },
            { onConflict: 'email', ignoreDuplicates: true },
          )
        const { data: stored } = await supabase
          .from('email_unsubscribe_tokens')
          .select('token')
          .eq('email', email)
          .maybeSingle()
        unsubscribeToken = stored?.token || unsubscribeToken
      }

      // Render + enqueue.
      const dateLabel = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      }).format(now)
      const firstName =
        p.first_name ||
        (p.full_name ? String(p.full_name).split(' ')[0] : null) ||
        null
      const templateData = { name: firstName ?? undefined, date: dateLabel }

      const html = await renderAsync(
        React.createElement(eodTemplate.component, templateData),
      )
      const plainText = await renderAsync(
        React.createElement(eodTemplate.component, templateData),
        { plainText: true },
      )
      const subject = typeof eodTemplate.subject === 'function'
        ? eodTemplate.subject(templateData)
        : eodTemplate.subject

      const messageId = crypto.randomUUID()
      const idempotencyKey = `eod-briefing-${email}-${dateStr}`

      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'end-of-day-briefing-ready',
        recipient_email: email,
        status: 'pending',
      })

      const { error: enqueueError } = await supabase.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text: plainText,
          purpose: 'transactional',
          label: 'end-of-day-briefing-ready',
          idempotency_key: idempotencyKey,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      })

      if (enqueueError) {
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: 'end-of-day-briefing-ready',
          recipient_email: email,
          status: 'failed',
          error_message: 'Failed to enqueue email',
        })
        results.push({ email, outcome: 'error', reason: 'enqueue_failed' })
        continue
      }

      results.push({ email, outcome: 'queued' })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error in send-end-of-day-briefing:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
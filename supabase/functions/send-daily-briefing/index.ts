import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { template as dailyBriefingTemplate } from '../_shared/transactional-email-templates/daily-briefing-ready.tsx'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "jturner@5thline.co";
const SITE_NAME = "fivelinenaitive";
const SENDER_DOMAIN = "notify.noreply.naitive.co";
const FROM_DOMAIN = "noreply.naitive.co";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
    });
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const dayOfWeek = dayFormatter.format(now);
    if (["Saturday", "Sunday"].includes(dayOfWeek)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `Today is ${dayOfWeek}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dateString = dateFormatter.format(now);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const templateData = { name: "James", date: dateString };
    const messageId = crypto.randomUUID();
    const idempotencyKey = `daily-briefing-${now.toISOString().slice(0, 10)}`;

    // Check suppression
    const { data: suppressed } = await supabase
      .from('suppressed_emails')
      .select('id')
      .eq('email', TARGET_EMAIL.toLowerCase())
      .maybeSingle();

    if (suppressed) {
      console.log('Daily briefing email suppressed for', TARGET_EMAIL);
      return new Response(
        JSON.stringify({ success: false, reason: 'email_suppressed' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create unsubscribe token
    let unsubscribeToken: string;
    const { data: existingToken } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token, used_at')
      .eq('email', TARGET_EMAIL.toLowerCase())
      .maybeSingle();

    if (existingToken && !existingToken.used_at) {
      unsubscribeToken = existingToken.token;
    } else if (!existingToken) {
      unsubscribeToken = generateToken();
      await supabase
        .from('email_unsubscribe_tokens')
        .upsert(
          { token: unsubscribeToken, email: TARGET_EMAIL.toLowerCase() },
          { onConflict: 'email', ignoreDuplicates: true }
        );
      const { data: storedToken } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', TARGET_EMAIL.toLowerCase())
        .maybeSingle();
      unsubscribeToken = storedToken?.token || unsubscribeToken;
    } else {
      console.log('Unsubscribe token already used for', TARGET_EMAIL);
      return new Response(
        JSON.stringify({ success: false, reason: 'email_suppressed' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Render the template
    const html = await renderAsync(
      React.createElement(dailyBriefingTemplate.component, templateData)
    );
    const plainText = await renderAsync(
      React.createElement(dailyBriefingTemplate.component, templateData),
      { plainText: true }
    );

    const resolvedSubject = typeof dailyBriefingTemplate.subject === 'function'
      ? dailyBriefingTemplate.subject(templateData)
      : dailyBriefingTemplate.subject;

    // Log pending
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'daily-briefing-ready',
      recipient_email: TARGET_EMAIL,
      status: 'pending',
    });

    // Enqueue
    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: TARGET_EMAIL,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: resolvedSubject,
        html,
        text: plainText,
        purpose: 'transactional',
        label: 'daily-briefing-ready',
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error('Failed to enqueue daily briefing email:', enqueueError);
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'daily-briefing-ready',
        recipient_email: TARGET_EMAIL,
        status: 'failed',
        error_message: 'Failed to enqueue email',
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to enqueue email' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[daily-briefing] Enqueued notification to ${TARGET_EMAIL}`);
    return new Response(
      JSON.stringify({ success: true, date: dateString, queued: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in send-daily-briefing:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "jturner@5thline.co";

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
    const idempotencyKey = `daily-briefing-${now.toISOString().slice(0, 10)}`;

    const logSend = async (
      status: 'sent' | 'suppressed' | 'failed',
      errorMessage?: string,
    ) => {
      const { error } = await supabase.from('email_send_log').insert({
        message_id: null,
        template_name: 'daily-briefing-ready',
        recipient_email: TARGET_EMAIL,
        status,
        error_message: errorMessage ?? null,
      });
      if (error) {
        console.error('Failed to write email_send_log', {
          code: error.code,
          message: error.message,
        });
      }
    };

    try {
      const result = await sendTemplateEmail('daily-briefing-ready', TARGET_EMAIL, {
        templateData,
        idempotencyKey,
      });

      if (!result.sent) {
        await logSend('suppressed');
        console.log('Daily briefing email suppressed for', TARGET_EMAIL);
        return new Response(
          JSON.stringify({ success: false, reason: 'email_suppressed' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await logSend('sent');
      console.log(`[daily-briefing] Sent notification to ${TARGET_EMAIL}`);
      return new Response(
        JSON.stringify({ success: true, date: dateString, sent: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logSend('failed', message.slice(0, 1000));
      console.error('Failed to send daily briefing email:', message);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("Error in send-daily-briefing:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
    // Check if today is a weekday (Mon-Fri) in Eastern Time
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
    const isWeekday = !["Saturday", "Sunday"].includes(dayOfWeek);

    if (!isWeekday) {
      return new Response(
        JSON.stringify({ skipped: true, reason: `Today is ${dayOfWeek}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dateString = dateFormatter.format(now);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Invoke send-transactional-email directly via fetch with service role auth
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          templateName: "daily-briefing-ready",
          recipientEmail: TARGET_EMAIL,
          idempotencyKey: `daily-briefing-${now.toISOString().slice(0, 10)}`,
          templateData: {
            name: "James",
            date: dateString,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send daily briefing email:", response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await response.json();
    console.log(`[daily-briefing] Sent notification to ${TARGET_EMAIL}`, result);
    return new Response(
      JSON.stringify({ success: true, date: dateString }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
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

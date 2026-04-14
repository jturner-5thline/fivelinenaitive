import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "jturner@5thline.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8";

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

    // Use anon key for the client (apikey header) but service role for Authorization
    const supabase = createClient(supabaseUrl, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    });

    const { data, error } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "daily-briefing-ready",
          recipientEmail: TARGET_EMAIL,
          idempotencyKey: `daily-briefing-${now.toISOString().slice(0, 10)}`,
          templateData: {
            name: "James",
            date: dateString,
          },
        },
      }
    );

    if (error) {
      console.error("Failed to send daily briefing email:", error);
      return new Response(
        JSON.stringify({ success: false, error: String(error) }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[daily-briefing] Sent notification to ${TARGET_EMAIL}`, data);
    return new Response(
      JSON.stringify({ success: true, date: dateString, data }),
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

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

    // Call send-transactional-email via raw fetch with proper headers
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
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

    const responseText = await response.text();
    console.log(`[daily-briefing] Response: ${response.status} ${responseText}`);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, status: response.status, error: responseText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, date: dateString }),
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

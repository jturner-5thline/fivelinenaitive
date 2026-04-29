// PERMANENTLY DISABLED — 2026-04-29
//
// This function used to send the daily "Your follow-ups for today" email.
// It has been entirely replaced by the in-app Daily Briefing
// (Pipeline & Clients tab → "Today's Follow-Ups", grouped by deal).
//
// The cron schedule has been unscheduled, the notification rule
// `deal.followup.morning_digest` has been disabled, and every profile's
// `morning_digest_enabled` flag has been forced to false. This handler is
// kept as a final safety net so that any straggling caller (manual invoke,
// retry queue, third-party trigger) cannot send the email.
//
// DO NOT re-enable without product approval.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  console.warn("[morning-followup-digest] Invoked but permanently disabled — no email sent.");
  return new Response(
    JSON.stringify({
      disabled: true,
      reason:
        "The 'Your follow-ups for today' email is permanently disabled. " +
        "Follow-ups are now shown in-app under Daily Briefing → Pipeline & Clients.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// FLEx integration permanently disconnected. This endpoint performs no work
// and makes no outbound calls.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ success: false, disabled: true, error: "FLEX_DISCONNECTED", message: "The FLEx integration has been disconnected." }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

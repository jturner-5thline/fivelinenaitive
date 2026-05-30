import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { hasClaapToken } from "../_shared/claap-api.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ token_present: hasClaapToken() }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
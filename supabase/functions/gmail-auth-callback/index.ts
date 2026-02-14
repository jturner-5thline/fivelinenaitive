import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// With Nylas v3 Hosted OAuth, the callback goes directly back to the frontend
// with a `code` query parameter. The frontend then calls gmail-auth exchange_code.
// This callback endpoint is kept as a no-op for backward compatibility.
serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Gmail auth callback hit - Nylas uses direct redirect to frontend");

  return new Response(JSON.stringify({ success: true, message: "Nylas uses direct frontend redirect" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

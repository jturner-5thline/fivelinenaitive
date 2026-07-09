import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude } from "../_shared/claudeChat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context } = await req.json();
    if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new Error("ANTHROPIC_API_KEY is not configured");

    const systemPrompt = `You are James Turner's executive AI chief of staff. Given a snapshot of his current deals, calendar, emails, and tasks, identify the single most urgent priority for today. Be specific, action-oriented, and reference the deal/contact/event by name. One short sentence (max 30 words). Start with a verb.`;

    const userPrompt = `Snapshot:\n${JSON.stringify(context, null, 2)}\n\nWhat is James's #1 priority today?`;

    const result = await callClaude({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 200,
    });
    const priority = result.text.trim();
    return new Response(JSON.stringify({ priority }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[james-top-priority] error:", message);
    return new Response(JSON.stringify({ priority: "", error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
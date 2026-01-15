import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-flex-api-key",
};

interface FlexActivityEvent {
  event_type: "view" | "download" | "info_request" | "save" | "share" | "nda_request" | "term_sheet_request";
  deal_id?: string; // Our internal deal_id
  flex_deal_id?: string; // FLEx's deal ID
  lender_name?: string;
  lender_email?: string;
  file_name?: string;
  file_category?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

interface WebhookPayload {
  events?: FlexActivityEvent[];
  event?: FlexActivityEvent; // Single event support
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate API key
    const apiKey = req.headers.get("x-flex-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    const expectedKey = Deno.env.get("FLEX_API_KEY");
    
    if (!apiKey || apiKey !== expectedKey) {
      console.error("Invalid or missing API key");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload: WebhookPayload = await req.json();
    console.log("Received FLEx activity webhook:", JSON.stringify(payload));

    // Support both single event and batch events
    const events = payload.events || (payload.event ? [payload.event] : []);
    
    if (events.length === 0) {
      return new Response(JSON.stringify({ error: "No events provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { success: boolean; event_type: string; deal_id?: string; error?: string }[] = [];

    for (const event of events) {
      try {
        let dealId = event.deal_id;

        // If we only have flex_deal_id, look up our internal deal_id
        if (!dealId && event.flex_deal_id) {
          const { data: syncRecord } = await supabase
            .from("flex_sync_history")
            .select("deal_id")
            .eq("flex_deal_id", event.flex_deal_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (syncRecord) {
            dealId = syncRecord.deal_id;
          }
        }

        if (!dealId) {
          console.error("Could not resolve deal_id for event:", event);
          results.push({ 
            success: false, 
            event_type: event.event_type, 
            error: "Could not resolve deal_id" 
          });
          continue;
        }

        // Map FLEx event types to our activity types
        const activityTypeMap: Record<string, string> = {
          view: "flex_deal_viewed",
          download: "flex_file_downloaded",
          info_request: "flex_info_requested",
          save: "flex_deal_saved",
          share: "flex_deal_shared",
          nda_request: "flex_nda_requested",
          term_sheet_request: "flex_term_sheet_requested",
        };

        const activityType = activityTypeMap[event.event_type] || `flex_${event.event_type}`;

        // Build description based on event type
        let description = "";
        const lenderInfo = event.lender_name || event.lender_email || "A lender";

        switch (event.event_type) {
          case "view":
            description = `${lenderInfo} viewed this deal on FLEx`;
            break;
          case "download":
            description = event.file_name 
              ? `${lenderInfo} downloaded "${event.file_name}" from FLEx`
              : `${lenderInfo} downloaded a file from FLEx`;
            break;
          case "info_request":
            description = event.message
              ? `${lenderInfo} requested information: "${event.message.substring(0, 100)}${event.message.length > 100 ? '...' : ''}"`
              : `${lenderInfo} requested more information on FLEx`;
            break;
          case "save":
            description = `${lenderInfo} saved this deal on FLEx`;
            break;
          case "share":
            description = `${lenderInfo} shared this deal on FLEx`;
            break;
          case "nda_request":
            description = `${lenderInfo} requested an NDA on FLEx`;
            break;
          case "term_sheet_request":
            description = `${lenderInfo} requested a term sheet on FLEx`;
            break;
          default:
            description = `${lenderInfo} performed action "${event.event_type}" on FLEx`;
        }

        // Insert activity log
        const { error: insertError } = await supabase
          .from("activity_logs")
          .insert({
            deal_id: dealId,
            activity_type: activityType,
            description,
            user_id: null, // External activity, no internal user
            metadata: {
              source: "flex",
              flex_deal_id: event.flex_deal_id,
              lender_name: event.lender_name,
              lender_email: event.lender_email,
              file_name: event.file_name,
              file_category: event.file_category,
              message: event.message,
              original_timestamp: event.timestamp,
              ...event.metadata,
            },
          });

        if (insertError) {
          console.error("Failed to insert activity log:", insertError);
          results.push({ 
            success: false, 
            event_type: event.event_type, 
            deal_id: dealId,
            error: insertError.message 
          });
        } else {
          console.log(`Logged FLEx activity: ${activityType} for deal ${dealId}`);
          results.push({ success: true, event_type: event.event_type, deal_id: dealId });
        }
      } catch (eventError) {
        console.error("Error processing event:", eventError);
        results.push({ 
          success: false, 
          event_type: event.event_type, 
          error: eventError instanceof Error ? eventError.message : "Unknown error" 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({ 
        success: failCount === 0,
        message: `Processed ${successCount} events successfully${failCount > 0 ? `, ${failCount} failed` : ""}`,
        results 
      }),
      {
        status: failCount === events.length ? 400 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

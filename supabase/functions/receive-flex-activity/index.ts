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

// Score weights for calculating engagement
const SCORE_WEIGHTS: Record<string, number> = {
  view: 1,
  download: 2,
  info_request: 5,
  save: 3,
  share: 4,
  nda_request: 10,
  term_sheet_request: 15,
};

// Alert types that should trigger immediate email
const ALERT_TRIGGERS = ['term_sheet_request', 'nda_request', 'info_request'];

// Hot engagement threshold
const HOT_ENGAGEMENT_THRESHOLD = 30;

// Alert type to title/message mapping
function getAlertContent(alertType: string, dealName: string, lenderName?: string, message?: string, engagementScore?: number) {
  const lender = lenderName || 'A lender';
  
  switch (alertType) {
    case 'term_sheet_request':
      return {
        title: '📋 Term Sheet Requested!',
        message: `${lender} has requested a term sheet for ${dealName}. This is a strong signal of interest!`,
      };
    case 'nda_request':
      return {
        title: '📝 NDA Requested',
        message: `${lender} has requested an NDA for ${dealName}. They want to proceed with due diligence.`,
      };
    case 'info_request':
      return {
        title: 'ℹ️ Information Requested',
        message: message 
          ? `${lender} is asking about ${dealName}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`
          : `${lender} has requested more information about ${dealName}.`,
      };
    case 'hot_engagement':
      return {
        title: '🔥 Hot Engagement!',
        message: `${dealName} is getting significant lender interest with an engagement score of ${engagementScore}!`,
      };
    default:
      return {
        title: '📊 FLEx Activity',
        message: `New activity on ${dealName} from FLEx.`,
      };
  }
}

async function sendFlexAlert(
  supabase: any,
  alertType: string,
  dealId: string,
  dealName: string,
  userId: string,
  lenderName?: string,
  lenderEmail?: string,
  message?: string,
  engagementScore?: number
) {
  try {
    const { title, message: alertMessage } = getAlertContent(alertType, dealName, lenderName, message, engagementScore);

    // Insert in-app notification
    const { error: insertError } = await supabase
      .from('flex_notifications')
      .insert({
        user_id: userId,
        deal_id: dealId,
        alert_type: alertType,
        title,
        message: alertMessage,
        lender_name: lenderName || null,
        lender_email: lenderEmail || null,
        engagement_score: engagementScore || null,
      });

    if (insertError) {
      console.error("Failed to insert flex notification:", insertError);
    } else {
      console.log(`In-app notification created for ${alertType}`);
    }

    // Send email alert
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-flex-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        alert_type: alertType,
        deal_id: dealId,
        deal_name: dealName,
        user_id: userId,
        lender_name: lenderName,
        lender_email: lenderEmail,
        message,
        engagement_score: engagementScore,
      }),
    });

    const result = await response.json();
    console.log(`FLEx email alert sent for ${alertType}:`, result);
    return result;
  } catch (error) {
    console.error("Failed to send FLEx alert:", error);
  }
}

async function checkAndTriggerHotEngagement(
  supabase: any,
  dealId: string,
  dealName: string,
  userId: string
) {
  try {
    // Get recent FLEx activity for this deal (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: activities, error } = await supabase
      .from("activity_logs")
      .select("activity_type, created_at")
      .eq("deal_id", dealId)
      .like("activity_type", "flex_%")
      .gte("created_at", sevenDaysAgo.toISOString());

    if (error) {
      console.error("Error fetching activities for hot check:", error);
      return;
    }

    // Calculate engagement score
    let score = 0;
    activities?.forEach((activity: { activity_type: string }) => {
      const eventType = activity.activity_type.replace('flex_', '').replace('_requested', '').replace('_viewed', '').replace('_downloaded', '');
      score += SCORE_WEIGHTS[eventType] || 1;
    });

    console.log(`Deal ${dealId} engagement score: ${score}`);

    // Check if we just crossed the hot threshold
    if (score >= HOT_ENGAGEMENT_THRESHOLD) {
      // Check if we've already sent a hot alert for this deal recently (within 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data: recentAlerts } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("deal_id", dealId)
        .eq("activity_type", "flex_hot_alert_sent")
        .gte("created_at", oneDayAgo.toISOString())
        .limit(1);

      if (!recentAlerts || recentAlerts.length === 0) {
        // Send hot engagement alert
        await sendFlexAlert(
          supabase,
          'hot_engagement',
          dealId,
          dealName,
          userId,
          undefined,
          undefined,
          undefined,
          score
        );

        // Log that we sent the alert to prevent duplicates
        await supabase.from("activity_logs").insert({
          deal_id: dealId,
          activity_type: "flex_hot_alert_sent",
          description: `Hot engagement alert sent (score: ${score})`,
          user_id: null,
          metadata: { engagement_score: score },
        });
      }
    }
  } catch (error) {
    console.error("Error checking hot engagement:", error);
  }
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

    const results: { success: boolean; event_type: string; deal_id?: string; error?: string; alert_sent?: boolean }[] = [];

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

        // Get deal info for alerts
        const { data: deal } = await supabase
          .from("deals")
          .select("company, user_id")
          .eq("id", dealId)
          .single();

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
          continue;
        }

        console.log(`Logged FLEx activity: ${activityType} for deal ${dealId}`);
        
        let alertSent = false;

        // Send alerts for high-priority events
        if (deal && ALERT_TRIGGERS.includes(event.event_type)) {
          await sendFlexAlert(
            supabase,
            event.event_type,
            dealId,
            deal.company,
            deal.user_id,
            event.lender_name,
            event.lender_email,
            event.message
          );
          alertSent = true;
        }

        // Check for hot engagement after each event
        if (deal) {
          await checkAndTriggerHotEngagement(supabase, dealId, deal.company, deal.user_id);
        }

        results.push({ success: true, event_type: event.event_type, deal_id: dealId, alert_sent: alertSent });
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
    const alertCount = results.filter(r => r.alert_sent).length;

    return new Response(
      JSON.stringify({ 
        success: failCount === 0,
        message: `Processed ${successCount} events successfully${failCount > 0 ? `, ${failCount} failed` : ""}${alertCount > 0 ? `, ${alertCount} alerts sent` : ""}`,
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

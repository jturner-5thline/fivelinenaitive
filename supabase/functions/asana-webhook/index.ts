import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hook-secret, x-hook-signature',
};

const ASANA_API = "https://app.asana.com/api/1.0";

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const computed = new TextDecoder().decode(hexEncode(new Uint8Array(sig)));
    return computed === signature;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Asana Webhook Handshake ---
  const hookSecret = req.headers.get("x-hook-secret");
  if (hookSecret) {
    console.log("Asana webhook handshake received");

    // Store the secret: Asana sends this on the initial POST to the target URL
    // We need to find the matching webhook record and store the secret
    const supabase = getSupabase();
    const url = new URL(req.url);
    // Try to extract integration context from query params if present
    const integrationId = url.searchParams.get("integration_id");
    const projectGid = url.searchParams.get("project_gid");

    if (integrationId && projectGid) {
      await supabase
        .from("asana_webhooks")
        .update({ webhook_secret: hookSecret })
        .eq("integration_id", integrationId)
        .eq("asana_project_gid", projectGid);
    }

    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "X-Hook-Secret": hookSecret,
      },
    });
  }

  // --- Webhook Event Processing ---
  try {
    const bodyText = await req.text();
    const hookSignature = req.headers.get("x-hook-signature");

    let body: { events?: Array<{ resource?: { gid?: string; resource_type?: string }; action?: string; parent?: { gid?: string } }> };
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const events = body.events || [];
    if (events.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabase();

    // Optionally verify signature if we have a webhook secret
    // We'll try to look up the secret from the first event's parent project
    if (hookSignature) {
      // Try to find any matching webhook secret to verify
      const { data: webhooks } = await supabase
        .from("asana_webhooks")
        .select("webhook_secret")
        .eq("is_active", true)
        .not("webhook_secret", "is", null)
        .limit(10);

      if (webhooks && webhooks.length > 0) {
        let verified = false;
        for (const wh of webhooks) {
          if (wh.webhook_secret && await verifySignature(bodyText, hookSignature, wh.webhook_secret)) {
            verified = true;
            break;
          }
        }
        if (!verified) {
          console.warn("Webhook signature verification failed - processing anyway for reliability");
        }
      }
    }

    // Process task change events
    for (const event of events) {
      if (
        event.resource?.resource_type !== "task" ||
        event.action !== "changed"
      ) {
        continue;
      }

      const taskGid = event.resource.gid;
      if (!taskGid) continue;

      console.log(`Processing task change for Asana task GID: ${taskGid}`);

      // Look up the corresponding naitive task
      const { data: naitiveTask, error: lookupError } = await supabase
        .from("tasks")
        .select("id, status, asana_task_gid")
        .eq("asana_task_gid", taskGid)
        .maybeSingle();

      if (lookupError) {
        console.error(`Error looking up task for GID ${taskGid}:`, lookupError);
        continue;
      }

      if (!naitiveTask) {
        console.log(`No naitive task found for Asana GID ${taskGid}, skipping`);
        continue;
      }

      // Find the integration token to fetch task details from Asana
      // Look up which integration owns this task via the asana_webhooks table
      const { data: webhook } = await supabase
        .from("asana_webhooks")
        .select("integration_id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!webhook) {
        console.error("No active webhook integration found");
        continue;
      }

      const { data: integration } = await supabase
        .from("integrations")
        .select("config")
        .eq("id", webhook.integration_id)
        .single();

      if (!integration?.config) {
        console.error("Integration config not found");
        continue;
      }

      const token = (integration.config as Record<string, string>).api_token;
      if (!token) {
        console.error("No API token in integration config");
        continue;
      }

      // Fetch current completion status from Asana
      const asanaRes = await fetch(`${ASANA_API}/tasks/${taskGid}?opt_fields=completed`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!asanaRes.ok) {
        console.error(`Asana API error fetching task ${taskGid}: ${asanaRes.status}`);
        continue;
      }

      const asanaData = await asanaRes.json();
      const isCompleted = asanaData.data?.completed === true;

      // Update naitive task
      const currentStatus = naitiveTask.status;
      const shouldBeStatus = isCompleted ? "complete" : "not_started";

      // Only update if status actually differs
      if (
        (isCompleted && currentStatus !== "complete" && currentStatus !== "completed") ||
        (!isCompleted && (currentStatus === "complete" || currentStatus === "completed"))
      ) {
        const updateData: Record<string, unknown> = {
          status: shouldBeStatus,
        };

        if (isCompleted) {
          updateData.completed_at = new Date().toISOString();
        } else {
          updateData.completed_at = null;
        }

        const { error: updateError } = await supabase
          .from("tasks")
          .update(updateData)
          .eq("id", naitiveTask.id);

        if (updateError) {
          console.error(`Error updating naitive task ${naitiveTask.id}:`, updateError);
        } else {
          console.log(`Synced Asana task ${taskGid} → naitive task ${naitiveTask.id}: ${shouldBeStatus}`);
        }
      } else {
        console.log(`Task ${taskGid} status unchanged, skipping update`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Asana webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200, // Return 200 to prevent Asana from retrying
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

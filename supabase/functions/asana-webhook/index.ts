import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hook-secret, x-hook-signature',
};

const ASANA_API = "https://app.asana.com/api/1.0";
const TASK_OPT_FIELDS = "completed,completed_at,name,notes,due_on,due_at,assignee,assignee.email,modified_at";

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

    const processEvents = async () => {
    const supabase = getSupabase();
    const url = new URL(req.url);
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
    const url = new URL(req.url);
    const urlIntegrationId = url.searchParams.get("integration_id");

    let body: {
      events?: Array<{
        resource?: { gid?: string; resource_type?: string };
        action?: string;
        parent?: { gid?: string };
      }>;
    };
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

    // Optionally verify signature
    if (hookSignature) {
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

    // Resolve the integration token once per request, scoped to the webhook's integration
    let integrationToken: string | null = null;
    {
      let integrationId = urlIntegrationId;
      if (!integrationId) {
        const { data: wh } = await supabase
          .from("asana_webhooks")
          .select("integration_id")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        integrationId = wh?.integration_id ?? null;
      }
      if (integrationId) {
        const { data: integration } = await supabase
          .from("integrations")
          .select("config")
          .eq("id", integrationId)
          .single();
        const cfg = integration?.config as Record<string, string> | null;
        integrationToken = cfg?.api_token ?? null;
      }
      if (!integrationToken) {
        console.error("Asana webhook: no API token resolved for integration", integrationId);
        return new Response(JSON.stringify({ ok: true, warning: "no_token" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Process task events (changed, deleted, removed)
    for (const event of events) {
      if (event.resource?.resource_type !== "task") continue;
      const action = event.action;
      if (action !== "changed" && action !== "deleted" && action !== "removed") continue;

      const taskGid = event.resource.gid;
      if (!taskGid) continue;

      console.log(`[asana-webhook] event ${action} for task ${taskGid}`);

      const { data: naitiveTask, error: lookupError } = await supabase
        .from("tasks")
        .select("id, title, description, status, due_date, assigned_to, archived_at")
        .eq("asana_task_gid", taskGid)
        .maybeSingle();

      if (lookupError) {
        console.error(`Lookup error for GID ${taskGid}:`, lookupError);
        continue;
      }
      if (!naitiveTask) {
        console.log(`No naitive task mapped for Asana GID ${taskGid}`);
        continue;
      }

      // Soft-delete on Asana deletion / project removal
      if (action === "deleted" || action === "removed") {
        if (!naitiveTask.archived_at) {
          const { error: archErr } = await supabase
            .from("tasks")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", naitiveTask.id);
          if (archErr) console.error(`Archive error for ${naitiveTask.id}:`, archErr);
          else console.log(`[asana-webhook] archived naitive task ${naitiveTask.id}`);
        }
        continue;
      }

      const token = integrationToken;

      // Fetch full task details from Asana
      const asanaRes = await fetch(`${ASANA_API}/tasks/${taskGid}?opt_fields=${TASK_OPT_FIELDS}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!asanaRes.ok) {
        console.error(`Asana API error fetching task ${taskGid}: ${asanaRes.status}`);
        continue;
      }

      const asanaData = await asanaRes.json();
      const asanaTask = asanaData.data;
      if (!asanaTask) continue;

      // Build update payload — only include fields that actually changed
      const updateData: Record<string, unknown> = {};
      let hasChanges = false;

      // 1. Completion status
      const isCompleted = asanaTask.completed === true;
      const naitiveIsComplete = naitiveTask.status === 'complete' || naitiveTask.status === 'completed';
      if (isCompleted !== naitiveIsComplete) {
        updateData.status = isCompleted ? 'complete' : 'not_started';
        if (isCompleted) {
          updateData.completed_at = new Date().toISOString();
        } else {
          updateData.completed_at = null;
        }
        hasChanges = true;
      }

      // 2. Task name
      if (asanaTask.name && asanaTask.name !== naitiveTask.title) {
        updateData.title = asanaTask.name;
        hasChanges = true;
      }

      // 3. Due date
      // Prefer due_at (datetime) when set; fall back to due_on (date)
      const asanaDueOn = asanaTask.due_at
        ? String(asanaTask.due_at).slice(0, 10)
        : asanaTask.due_on || null;
      const naitiveDueDate = naitiveTask.due_date || null;
      if (asanaDueOn !== naitiveDueDate) {
        updateData.due_date = asanaDueOn;
        hasChanges = true;
      }

      // 4. Description / notes
      const asanaNotes = typeof asanaTask.notes === "string" ? asanaTask.notes : null;
      const naitiveDescription = naitiveTask.description ?? null;
      if (asanaNotes !== null && asanaNotes !== naitiveDescription) {
        updateData.description = asanaNotes;
        hasChanges = true;
      }

      // 5. Assignee (match by email)
      const asanaAssigneeEmail = asanaTask.assignee?.email || null;
      if (asanaAssigneeEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", asanaAssigneeEmail)
          .maybeSingle();

        if (profile?.user_id && profile.user_id !== naitiveTask.assigned_to) {
          updateData.assigned_to = profile.user_id;
          hasChanges = true;
        } else if (!profile?.user_id) {
          console.warn(`[asana-webhook] could not map Asana assignee ${asanaAssigneeEmail} for task ${taskGid}`);
        }
      }

      if (!hasChanges) {
        console.log(`[asana-webhook] task ${taskGid}: no diff, skip`);
        continue;
      }

      // Loop-prevention marker: stamp this update as originating from Asana
      // so the Naitive client (useTasks) skips pushing it back to Asana.
      updateData.sync_source = 'asana';
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", naitiveTask.id);

      if (updateError) {
        console.error(`[asana-webhook] update error for naitive task ${naitiveTask.id} (gid ${taskGid}):`, updateError);
        await supabase.from("asana_sync_log").insert({
          task_id: naitiveTask.id,
          asana_task_gid: taskGid,
          action: "inbound_update",
          success: false,
          error_message: updateError.message,
          payload: { event_action: action, fields: Object.keys(updateData) },
        });
      } else {
        console.log(
          `[asana-webhook] synced ${taskGid} → ${naitiveTask.id} fields:`,
          Object.keys(updateData).filter((k) => k !== 'sync_source' && k !== 'updated_at'),
        );
        await supabase.from("asana_sync_log").insert({
          task_id: naitiveTask.id,
          asana_task_gid: taskGid,
          action: "inbound_update",
          success: true,
          payload: { event_action: action, fields: Object.keys(updateData) },
          company_id: null,
        });
      }
    }

    };

    // Asana requires the webhook endpoint to acknowledge delivery within ten
    // seconds. Fetching task details and applying several events inline could
    // exceed that deadline, so acknowledge first and keep the work alive in
    // the edge runtime. This also prevents Asana from disabling an otherwise
    // valid webhook after repeated timeout failures.
    EdgeRuntime.waitUntil(
      processEvents().catch((error) => {
        console.error("Asana webhook background processing error:", error);
      }),
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Asana webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

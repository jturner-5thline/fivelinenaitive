import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASANA_API = "https://app.asana.com/api/1.0";
const OPT_FIELDS = "completed,completed_at,name,due_on,due_at,modified_at";

interface TaskRow {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  completed_at: string | null;
  asana_task_gid: string;
}

const isCompleteStatus = (s: string | null) => s === "complete" || s === "completed";

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        await fn(items[i]);
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    // Default: only rows still open locally (the "completed in Asana, still open
    // here" case). full=true walks every linked row and also reopens tasks that
    // were un-completed in Asana.
    const full = body?.full === true;
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 2000;

    const { data: integrations, error: intErr } = await supabase
      .from("integrations")
      .select("id, company_id, config, status")
      .eq("type", "asana");
    if (intErr) throw intErr;

    const results: Record<string, unknown>[] = [];

    for (const integration of integrations || []) {
      const token = (integration as any)?.config?.api_token as string | undefined;
      if (!token || (integration as any).status !== "connected") {
        results.push({ integration_id: integration.id, skipped: "no_token_or_disconnected" });
        continue;
      }

      let query = supabase
        .from("tasks")
        .select("id, title, status, due_date, completed_at, asana_task_gid")
        .not("asana_task_gid", "is", null)
        .is("archived_at", null)
        .limit(limit);
      if ((integration as any).company_id) {
        query = query.eq("company_id", (integration as any).company_id);
      }
      if (!full) {
        query = query.not("status", "in", '("complete","completed")');
      }

      const { data: tasks, error: taskErr } = await query;
      if (taskErr) throw taskErr;

      let updated = 0, completed = 0, reopened = 0, dueChanged = 0, missing = 0, failed = 0;
      const changes: Record<string, unknown>[] = [];

      await mapLimit((tasks || []) as unknown as TaskRow[], 5, async (task) => {
        try {
          const res = await fetch(
            `${ASANA_API}/tasks/${task.asana_task_gid}?opt_fields=${OPT_FIELDS}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (res.status === 404) { missing++; return; }
          if (res.status === 429) {
            const retryAfter = Number(res.headers.get("Retry-After") || "5");
            await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
            failed++;
            return;
          }
          if (!res.ok) {
            failed++;
            console.error(`[asana-reconcile] ${task.asana_task_gid} -> HTTP ${res.status}`);
            return;
          }

          const asanaTask = (await res.json())?.data;
          if (!asanaTask) return;

          const updateData: Record<string, unknown> = {};

          const asanaComplete = asanaTask.completed === true;
          if (asanaComplete !== isCompleteStatus(task.status)) {
            updateData.status = asanaComplete ? "complete" : "not_started";
            updateData.completed_at = asanaComplete
              ? (asanaTask.completed_at || new Date().toISOString())
              : null;
            if (asanaComplete) completed++; else reopened++;
          }

          const asanaDue = asanaTask.due_at
            ? String(asanaTask.due_at).slice(0, 10)
            : (asanaTask.due_on || null);
          const localDue = task.due_date ? String(task.due_date).slice(0, 10) : null;
          if (asanaDue !== localDue) {
            updateData.due_date = asanaDue;
            dueChanged++;
          }

          if (Object.keys(updateData).length === 0) return;

          changes.push({ task_id: task.id, title: task.title, ...updateData });
          if (dryRun) return;

          updateData.sync_source = "asana";
          updateData.asana_synced_at = new Date().toISOString();
          updateData.updated_at = new Date().toISOString();

          const { error: upErr } = await supabase.from("tasks").update(updateData).eq("id", task.id);
          if (upErr) {
            failed++;
            console.error(`[asana-reconcile] update failed for ${task.id}:`, upErr.message);
            return;
          }
          updated++;

          await supabase.from("asana_sync_log").insert({
            task_id: task.id,
            asana_task_gid: task.asana_task_gid,
            action: "inbound_reconcile",
            success: true,
            payload: { fields: Object.keys(updateData) },
            company_id: (integration as any).company_id || null,
          });
        } catch (e) {
          failed++;
          console.error(`[asana-reconcile] error on ${task.asana_task_gid}:`, e);
        }
      });

      results.push({
        integration_id: integration.id,
        scanned: tasks?.length || 0,
        updated, completed, reopened,
        due_changed: dueChanged,
        missing_in_asana: missing,
        failed,
        ...(dryRun ? { dry_run: true, changes } : {}),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[asana-reconcile] fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

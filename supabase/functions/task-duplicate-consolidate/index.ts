import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Fields where canonical "wins" if non-empty; otherwise we copy from candidate.
const MERGE_FIELDS = [
  "description", "due_date", "start_date", "priority", "deal_id",
  "contact_id", "crm_company_id", "lender_id", "blocker_note",
  "recurrence_rule", "recurrence_end_date",
] as const;

function pickFieldUpdates(canonical: any, candidate: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of MERGE_FIELDS) {
    const cVal = canonical[f];
    const dVal = candidate[f];
    const cEmpty = cVal === null || cVal === undefined || cVal === "";
    const dEmpty = dVal === null || dVal === undefined || dVal === "";
    if (cEmpty && !dEmpty) out[f] = dVal;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const { row_id, candidate_task_id, canonical_task_id } = body || {};
    if (!row_id || !candidate_task_id || !canonical_task_id) {
      return new Response(JSON.stringify({ error: "row_id, candidate_task_id, canonical_task_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (candidate_task_id === canonical_task_id) {
      return new Response(JSON.stringify({ error: "candidate and canonical must differ" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load both tasks + the dup row
    const [{ data: candidate, error: cErr }, { data: canonical, error: kErr }, { data: row, error: rErr }] = await Promise.all([
      admin.from("tasks").select("*").eq("id", candidate_task_id).maybeSingle(),
      admin.from("tasks").select("*").eq("id", canonical_task_id).maybeSingle(),
      admin.from("task_duplicate_candidates").select("*").eq("id", row_id).maybeSingle(),
    ]);
    if (cErr || kErr || rErr || !candidate || !canonical || !row) {
      return new Response(JSON.stringify({ error: "Records not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (candidate.company_id !== canonical.company_id) {
      return new Response(JSON.stringify({ error: "Tasks belong to different companies" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: caller must be a member of the company
    const { data: m } = await admin.from("company_members")
      .select("company_id").eq("user_id", userId).eq("company_id", candidate.company_id).maybeSingle();
    if (!m) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Field merge: only fill blanks on canonical
    const fieldUpdates = pickFieldUpdates(canonical, candidate);
    // Append candidate description if both have content
    if (candidate.description && canonical.description &&
        candidate.description.trim() !== canonical.description.trim() &&
        !canonical.description.includes(candidate.description.trim())) {
      fieldUpdates.description = `${canonical.description}\n\n— Merged from duplicate —\n${candidate.description}`;
    }
    if (Object.keys(fieldUpdates).length > 0) {
      const { error: updErr } = await admin.from("tasks").update(fieldUpdates).eq("id", canonical.id);
      if (updErr) console.error("canonical field merge failed", updErr);
    }

    // 2) Move attachments
    await admin.from("task_attachments").update({ task_id: canonical.id }).eq("task_id", candidate.id);

    // 3) Move comments (preserve authorship/timestamps)
    await admin.from("task_comments").update({ task_id: canonical.id }).eq("task_id", candidate.id);

    // 4) Move collaborators (skip if same user already collaborator)
    const { data: cands } = await admin.from("task_collaborators").select("user_id").eq("task_id", candidate.id);
    const { data: kanonCol } = await admin.from("task_collaborators").select("user_id").eq("task_id", canonical.id);
    const existing = new Set((kanonCol || []).map((x: any) => x.user_id));
    const toInsert = (cands || [])
      .filter((c: any) => !existing.has(c.user_id))
      .map((c: any) => ({ task_id: canonical.id, user_id: c.user_id }));
    if (toInsert.length > 0) {
      await admin.from("task_collaborators").insert(toInsert);
    }
    await admin.from("task_collaborators").delete().eq("task_id", candidate.id);

    // 5) Re-parent subtasks (children of the candidate become children of canonical)
    await admin.from("tasks").update({ parent_task_id: canonical.id }).eq("parent_task_id", candidate.id);

    // 6) Archive (NOT delete) the candidate
    await admin.from("tasks")
      .update({ archived_at: new Date().toISOString(), status: "complete", completed_by: userId, completed_at: new Date().toISOString() })
      .eq("id", candidate.id);

    // 7) Mark the dup-candidate row as consolidated
    await admin.from("task_duplicate_candidates")
      .update({
        status: "consolidated",
        review_action: "consolidated",
        canonical_task_id: canonical.id,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq("id", row_id);

    // 8) Also mark any other pending dup rows for this candidate as superseded
    await admin.from("task_duplicate_candidates")
      .update({ status: "consolidated", review_action: "consolidated", reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq("candidate_task_id", candidate.id)
      .eq("status", "pending");

    return new Response(JSON.stringify({
      ok: true,
      canonical_task_id: canonical.id,
      candidate_task_id: candidate.id,
      field_updates: fieldUpdates,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("task-duplicate-consolidate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
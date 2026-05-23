import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  verifiedDealUpdate,
  WriteNotPersistedError,
  writeNotPersistedPayload,
} from "../_shared/verifiedDealUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Heuristic guardrail: detects when a "note" payload is actually an email
 * body — keeps the AI from polluting deals.notes with email content.
 */
function looksLikeEmailBody(text: string | null | undefined): boolean {
  if (!text || text.length < 40) return false;
  const t = text.toLowerCase();
  let hits = 0;
  // Subject: header at line start
  if (/^\s*subject\s*:/m.test(text)) hits += 2;
  // From:/To:/Cc: headers
  if (/^\s*(from|to|cc|bcc)\s*:/m.test(text)) hits += 2;
  // Greeting line ("Hi Name," / "Hello Name," / "Dear Name,")
  if (/^\s*(hi|hello|dear|hey)\b[^\n]{0,40},\s*$/m.test(text)) hits += 1;
  // Sign-off ("Best,", "Best regards,", "Cheers,", "Sincerely,", "Thanks,")
  if (/^\s*(best( regards)?|kind regards|warm regards|cheers|sincerely|regards|thanks(,| again)?|talk soon|speak soon)[,.]?\s*$/im.test(text)) hits += 1;
  // Embedded email address (bare token)
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) hits += 1;
  // "Sent from my iPhone" / forwarded-message marker
  if (/sent from my (iphone|android|blackberry)|-+\s*forwarded message\s*-+|on .{0,30} wrote:/i.test(text)) hits += 2;
  return hits >= 3;
}

// Dice coefficient for fuzzy matching
function dice(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const c = bigrams1.get(bg) || 0;
    if (c > 0) { bigrams1.set(bg, c - 1); inter++; }
  }
  return (2.0 * inter) / (s1.length - 1 + (s2.length - 1));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return err("Unauthorized", 401);

    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const companyId = membership?.company_id;

    const body = await req.json();
    const { action, params } = body;

    // Helper: log activity
    async function logActivity(dealId: string, type: string, description: string, metadata?: Record<string, unknown>) {
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user!.id).single();
      await supabase.from("activity_logs").insert({
        deal_id: dealId,
        activity_type: type,
        description,
        user_id: user!.id,
        user_display_name: profile?.display_name || "Unknown",
        metadata: metadata || null,
      });
    }

    // Helper: find deal by name or id with fuzzy matching
    async function findDeal(nameOrId: string) {
      // Try UUID first
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) {
        const { data } = await supabase.from("deals").select("*").eq("id", nameOrId).single();
        if (data) return { deal: data, suggestions: [] };
      }

      // Search by company name
      let query = supabase.from("deals").select("*");
      if (companyId) query = query.eq("company_id", companyId);
      const { data: deals } = await query;
      if (!deals || deals.length === 0) return { deal: null, suggestions: [] };

      // Exact match first
      const exact = deals.find((d: any) => d.company.toLowerCase() === nameOrId.toLowerCase());
      if (exact) return { deal: exact, suggestions: [] };

      // Contains match
      const contains = deals.find((d: any) => d.company.toLowerCase().includes(nameOrId.toLowerCase()));
      if (contains) return { deal: contains, suggestions: [] };

      // Reverse contains
      const revContains = deals.find((d: any) => nameOrId.toLowerCase().includes(d.company.toLowerCase()));
      if (revContains) return { deal: revContains, suggestions: [] };

      // Fuzzy match
      const scored = deals.map((d: any) => ({ deal: d, score: dice(d.company, nameOrId) }))
        .filter(s => s.score > 0.3)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0 && scored[0].score > 0.5) {
        return { deal: scored[0].deal, suggestions: scored.slice(1, 4).map(s => s.deal.company) };
      }

      return { deal: null, suggestions: scored.slice(0, 5).map(s => s.deal.company) };
    }

    switch (action) {
      // ─── GET DEAL ─────────────────────────────────
      case "get_deal": {
        const { name_or_id } = params;
        const result = await findDeal(name_or_id);
        if (!result.deal) return ok({ found: false, suggestions: result.suggestions });

        const deal = result.deal;

        // Get lender count
        const { count: lenderCount } = await supabase
          .from("deal_lenders").select("*", { count: "exact", head: true })
          .eq("deal_id", deal.id);

        // Get outstanding items count
        const { count: outstandingCount } = await supabase
          .from("outstanding_items").select("*", { count: "exact", head: true })
          .eq("deal_id", deal.id)
          .neq("status", "completed");

        // Get milestones count
        const { data: milestones } = await supabase
          .from("deal_milestones").select("id, completed")
          .eq("deal_id", deal.id);

        const completedMilestones = milestones?.filter((m: any) => m.completed).length || 0;
        const totalMilestones = milestones?.length || 0;

        return ok({
          found: true,
          deal: {
            id: deal.id,
            name: deal.company,
            value: deal.value,
            stage: deal.stage,
            status: deal.status,
            engagement_type: deal.engagement_type,
            manager: deal.manager,
            deal_owner: deal.deal_owner,
            analyst: deal.analyst,
            notes: deal.notes,
            is_flagged: deal.is_flagged,
            flag_notes: deal.flag_notes,
            created_at: deal.created_at,
            updated_at: deal.updated_at,
            closing_date: deal.closing_date,
            lender_count: lenderCount || 0,
            outstanding_items_count: outstandingCount || 0,
            milestones_completed: completedMilestones,
            milestones_total: totalMilestones,
          },
        });
      }

      // ─── GET DEAL LENDERS ─────────────────────────
      case "get_deal_lenders": {
        const { deal_id } = params;
        const { data: lenders } = await supabase
          .from("deal_lenders")
          .select("id, name, stage, substage, tracking_status, notes, score, pass_reason, quote_amount, quote_rate, quote_term")
          .eq("deal_id", deal_id)
          .order("name");
        return ok({ lenders: lenders || [] });
      }

      // ─── GET OUTSTANDING ITEMS ────────────────────
      case "get_outstanding_items": {
        const { deal_id } = params;
        const { data: items } = await supabase
          .from("outstanding_items")
          .select("id, description, status, priority, due_date, assigned_to, notes")
          .eq("deal_id", deal_id)
          .order("position");
        return ok({ items: items || [] });
      }

      // ─── UPDATE DEAL STAGE ────────────────────────
      case "update_deal_stage": {
        const { deal_id, new_stage } = params;
        const { data: current } = await supabase.from("deals").select("company, stage").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        await verifiedDealUpdate(supabase, deal_id, {
          stage: new_stage,
          updated_at: new Date().toISOString(),
        });

        await logActivity(deal_id, "stage_change", `Stage changed from ${current.stage} to ${new_stage}`, {
          from_stage: current.stage,
          to_stage: new_stage,
        });

        return ok({ previous_stage: current.stage, new_stage, deal_name: current.company });
      }

      // ─── UPDATE DEAL STATUS ───────────────────────
      case "update_deal_status": {
        const { deal_id, new_status } = params;
        const { data: current } = await supabase.from("deals").select("company, status").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        await verifiedDealUpdate(supabase, deal_id, {
          status: new_status,
          updated_at: new Date().toISOString(),
        });

        await logActivity(deal_id, "status_change", `Status changed from ${current.status} to ${new_status}`, {
          from_status: current.status,
          to_status: new_status,
        });

        return ok({ previous_status: current.status, new_status, deal_name: current.company });
      }

      // ─── UPDATE DEAL NOTES ────────────────────────
      case "update_deal_notes": {
        const { deal_id, note_text } = params;
        const { data: current } = await supabase.from("deals").select("company, notes").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        // Guardrail: notes are for user-authored context. Email bodies belong
        // in the Communications timeline (activity_logs type='email'), not in
        // the free-text notes field. If the AI tries to paste an email here,
        // refuse and instruct it to use the email path instead.
        if (looksLikeEmailBody(note_text)) {
          return err(
            "This text looks like an email body (subject line, greeting, signature, or recipient address detected). " +
              "Don't write emails into the notes field — use the email composer / Communications timeline. " +
              "If this really is a note, rewrite it without email scaffolding (no 'Subject:', 'Hi <name>,', 'Best,' signature, or bare email addresses).",
          );
        }

        const timestamp = new Date().toISOString().split("T")[0];
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).single();
        const author = profile?.display_name || "AI Assistant";
        const newNote = `[${timestamp} - ${author}] ${note_text}`;
        const updatedNotes = current.notes ? `${newNote}\n\n${current.notes}` : newNote;

        await verifiedDealUpdate(
          supabase,
          deal_id,
          {
            notes: updatedNotes,
            notes_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          // `notes_updated_at` is bumped on the server side; don't compare exact ts.
          { skipVerifyFields: ["notes_updated_at"] },
        );

        await logActivity(deal_id, "note_added", `Note added via AI: ${note_text.substring(0, 100)}`, { note_preview: note_text.substring(0, 200) });

        return ok({ deal_name: current.company, note_added: newNote });
      }

      // ─── ADD LENDER TO DEAL ───────────────────────
      case "add_lender_to_deal": {
        const { deal_id, lender_name } = params;
        const { data: current } = await supabase.from("deals").select("company").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        // Check if lender already exists on deal
        const { data: existing } = await supabase
          .from("deal_lenders")
          .select("id")
          .eq("deal_id", deal_id)
          .ilike("name", lender_name)
          .limit(1);
        if (existing && existing.length > 0) return err(`${lender_name} is already on this deal`);

        const { data: newLender, error: insertErr } = await supabase
          .from("deal_lenders")
          .insert({
            deal_id,
            name: lender_name,
            stage: "reviewing-drl",
            tracking_status: "active",
          })
          .select()
          .single();
        if (insertErr) return err(insertErr.message);

        await logActivity(deal_id, "lender_added", `Lender ${lender_name} added via AI`);

        return ok({ deal_name: current.company, lender: { id: newLender.id, name: lender_name } });
      }

      // ─── ADD MULTIPLE LENDERS TO DEAL (atomic batch) ──
      // One Confirm card from the UI can stand for N entities. We insert
      // every row in a single Postgres statement so the operation is
      // row-level atomic: if any row violates a constraint, Postgres
      // rolls back the entire INSERT and no partial state is left
      // behind. After the insert we re-read deal_lenders to verify
      // BOTH rows landed; any missing entity is reported back so the
      // client can render a red "Failed" chip for it.
      case "add_lenders_to_deal": {
        const { deal_id } = params;
        const lender_names: string[] = Array.isArray(params.lender_names) ? params.lender_names : [];
        if (!deal_id || lender_names.length === 0) return err("deal_id and lender_names[] required");

        const { data: current } = await supabase.from("deals").select("company").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        // De-dup user input and filter ones already on the deal
        const uniq = Array.from(new Set(lender_names.map((n) => n.trim()).filter(Boolean)));
        const { data: alreadyOn } = await supabase
          .from("deal_lenders")
          .select("name")
          .eq("deal_id", deal_id);
        const existingLower = new Set((alreadyOn || []).map((r: any) => (r.name || "").toLowerCase()));

        const toInsert: Array<{ deal_id: string; name: string; stage: string; tracking_status: string }> = [];
        const skipped: string[] = [];
        for (const name of uniq) {
          if (existingLower.has(name.toLowerCase())) {
            skipped.push(name);
          } else {
            toInsert.push({ deal_id, name, stage: "reviewing-drl", tracking_status: "active" });
          }
        }

        let inserted: any[] = [];
        if (toInsert.length > 0) {
          // Atomic single-statement insert. Either every row is persisted
          // or none are.
          const { data, error: insertErr } = await supabase
            .from("deal_lenders")
            .insert(toInsert)
            .select();
          if (insertErr) return err(insertErr.message);
          inserted = data || [];
        }

        // Post-write verification: re-read names back and compare against
        // what we asked for. Anything missing is surfaced as a failure
        // for that specific entity so the client renders the red card.
        const { data: after } = await supabase
          .from("deal_lenders")
          .select("id, name")
          .eq("deal_id", deal_id);
        const afterLower = new Set((after || []).map((r: any) => (r.name || "").toLowerCase()));
        const failed = uniq.filter((n) => !afterLower.has(n.toLowerCase()) && !skipped.includes(n));

        for (const row of inserted) {
          await logActivity(deal_id, "lender_added", `Lender ${row.name} added via AI (batch)`);
        }

        return ok({
          deal_name: current.company,
          inserted: inserted.map((r: any) => ({ id: r.id, name: r.name })),
          skipped_existing: skipped,
          failed,
          requested_count: uniq.length,
          inserted_count: inserted.length,
          atomic: true,
        });
      }

      // ─── REMOVE LENDER FROM DEAL ──────────────────
      case "remove_lender_from_deal": {
        const { deal_id, lender_name } = params;
        const { data: lender } = await supabase
          .from("deal_lenders")
          .select("id, name")
          .eq("deal_id", deal_id)
          .ilike("name", `%${lender_name}%`)
          .limit(1)
          .single();
        if (!lender) return err(`Lender "${lender_name}" not found on this deal`);

        const { data: current } = await supabase.from("deals").select("company").eq("id", deal_id).single();

        const { error: deleteErr } = await supabase.from("deal_lenders").delete().eq("id", lender.id);
        if (deleteErr) return err(deleteErr.message);

        await logActivity(deal_id, "lender_removed", `Lender ${lender.name} removed via AI`);

        return ok({ deal_name: current?.company, lender_name: lender.name });
      }

      // ─── UPDATE LENDER STAGE ──────────────────────
      case "update_lender_stage": {
        const { deal_id, lender_name, new_stage } = params;
        const { data: lender } = await supabase
          .from("deal_lenders")
          .select("id, name, stage")
          .eq("deal_id", deal_id)
          .ilike("name", `%${lender_name}%`)
          .limit(1)
          .single();
        if (!lender) return err(`Lender "${lender_name}" not found on this deal`);

        const { data: current } = await supabase.from("deals").select("company").eq("id", deal_id).single();

        const { error: updateErr } = await supabase
          .from("deal_lenders")
          .update({ stage: new_stage, updated_at: new Date().toISOString() })
          .eq("id", lender.id);
        if (updateErr) return err(updateErr.message);

        await logActivity(deal_id, "lender_stage_change", `Lender ${lender.name} stage changed from ${lender.stage} to ${new_stage}`, {
          lender_name: lender.name,
          from_stage: lender.stage,
          to_stage: new_stage,
        });

        return ok({ deal_name: current?.company, lender_name: lender.name, previous_stage: lender.stage, new_stage });
      }

      // ─── ADD OUTSTANDING ITEM ─────────────────────
      case "add_outstanding_item": {
        const { deal_id, title, description } = params;
        const { data: current } = await supabase.from("deals").select("company").eq("id", deal_id).single();
        if (!current) return err("Deal not found");

        const { data: maxPos } = await supabase
          .from("outstanding_items")
          .select("position")
          .eq("deal_id", deal_id)
          .order("position", { ascending: false })
          .limit(1);
        const nextPos = (maxPos?.[0]?.position ?? -1) + 1;

        const { data: item, error: insertErr } = await supabase
          .from("outstanding_items")
          .insert({
            deal_id,
            description: title || description,
            notes: description && title ? description : null,
            status: "pending",
            priority: "medium",
            position: nextPos,
            user_id: user.id,
          })
          .select()
          .single();
        if (insertErr) return err(insertErr.message);

        await logActivity(deal_id, "outstanding_item_added", `Outstanding item added via AI: ${(title || description).substring(0, 100)}`);

        return ok({ deal_name: current.company, item: { id: item.id, description: item.description } });
      }

      // ─── MARK OUTSTANDING ITEM COMPLETE ───────────
      case "mark_outstanding_item_complete": {
        const { item_id, deal_id } = params;
        const { data: item } = await supabase
          .from("outstanding_items")
          .select("id, description, deal_id")
          .eq("id", item_id)
          .single();
        if (!item) return err("Outstanding item not found");

        const actualDealId = deal_id || item.deal_id;

        const { error: updateErr } = await supabase
          .from("outstanding_items")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", item_id);
        if (updateErr) return err(updateErr.message);

        await logActivity(actualDealId, "outstanding_item_completed", `Outstanding item completed via AI: ${item.description.substring(0, 100)}`);

        return ok({ item_id, description: item.description });
      }

      // ─── SEARCH DEALS ────────────────────────────
      case "search_deals": {
        const { query: searchQuery } = params;
        let q = supabase.from("deals").select("id, company, stage, status, value, manager, updated_at");
        if (companyId) q = q.eq("company_id", companyId);
        const { data: deals } = await q;
        if (!deals) return ok({ results: [] });

        const results = deals
          .map((d: any) => ({ ...d, score: dice(d.company, searchQuery) }))
          .filter((d: any) => d.score > 0.2 || d.company.toLowerCase().includes(searchQuery.toLowerCase()))
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 10);

        return ok({ results });
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Deal operations error:", error);
    if (error instanceof WriteNotPersistedError) {
      return new Response(JSON.stringify(writeNotPersistedPayload(error)), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return err(error instanceof Error ? error.message : "Unknown error", 500);
  }
});

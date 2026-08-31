import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map field_name to contacts table column
const FIELD_TO_COLUMN: Record<string, string> = {
  job_title: "job_title",
  email: "email",
  phone_work: "phone_work",
  phone_mobile: "phone_mobile",
  department: "department",
  seniority: "seniority",
  linkedin_url: "linkedin_url",
  contact_type: "contact_type",
};

async function getUserId(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await anonClient.auth.getUser();
  return user?.id || null;
}

async function processSuggestion(
  supabase: ReturnType<typeof createClient>,
  suggestionId: string,
  action: string,
  userId: string,
  snoozeUntil?: string
) {
  // Fetch suggestion
  const { data: suggestion, error: fetchErr } = await supabase
    .from("contact_field_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .single();

  if (fetchErr || !suggestion) {
    return { error: "Suggestion not found", status: 404 };
  }

  if (suggestion.status !== "pending" && suggestion.status !== "snoozed") {
    return { error: `Suggestion already ${suggestion.status}`, status: 400 };
  }

  if (action === "accept") {
    const column = FIELD_TO_COLUMN[suggestion.field_name];
    let updatePayload: Record<string, unknown> | null = null;

    if (column) {
      updatePayload = { [column]: suggestion.suggested_value };
    } else if (suggestion.field_name === "company_name") {
      // Contacts have no company_name column — resolve the name to a CRM company link.
      const { data: contactRow } = await supabase
        .from("contacts")
        .select("org_company_id")
        .eq("id", suggestion.contact_id)
        .maybeSingle();

      const name = String(suggestion.suggested_value || "").trim();
      let crmQuery = supabase
        .from("crm_companies")
        .select("id")
        .ilike("name", name)
        .limit(1);
      if (contactRow?.org_company_id) {
        crmQuery = crmQuery.eq("org_company_id", contactRow.org_company_id);
      }
      const { data: crmCompany } = await crmQuery.maybeSingle();

      if (!crmCompany?.id) {
        return {
          error: `No CRM company matches "${name}". Create or link the company first.`,
          status: 400,
        };
      }
      updatePayload = { crm_company_id: crmCompany.id };
    } else {
      return { error: `Unknown field: ${suggestion.field_name}`, status: 400 };
    }

    // Update contact field
    const { error: updateErr } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("id", suggestion.contact_id);

    if (updateErr) {
      console.error("Contact update error:", updateErr);
      return { error: "Failed to update contact", status: 500 };
    }

    // Mark suggestion accepted
    await supabase
      .from("contact_field_suggestions")
      .update({
        status: "accepted",
        acted_by_user_id: userId,
        acted_at: new Date().toISOString(),
      })
      .eq("id", suggestionId);

    // Insert audit
    await supabase.from("contact_field_suggestion_audit").insert({
      suggestion_id: suggestionId,
      contact_id: suggestion.contact_id,
      field_name: suggestion.field_name,
      old_value: suggestion.current_value,
      new_value: suggestion.suggested_value,
      action: "accepted",
      actor_user_id: userId,
    });

    // Supersede other pending suggestions for same contact+field
    await supabase
      .from("contact_field_suggestions")
      .update({ status: "superseded" })
      .eq("contact_id", suggestion.contact_id)
      .eq("field_name", suggestion.field_name)
      .eq("status", "pending")
      .neq("id", suggestionId);

    return { data: { success: true, action: "accepted", suggestion_id: suggestionId } };
  }

  if (action === "reject") {
    await supabase
      .from("contact_field_suggestions")
      .update({
        status: "rejected",
        acted_by_user_id: userId,
        acted_at: new Date().toISOString(),
      })
      .eq("id", suggestionId);

    await supabase.from("contact_field_suggestion_audit").insert({
      suggestion_id: suggestionId,
      contact_id: suggestion.contact_id,
      field_name: suggestion.field_name,
      old_value: suggestion.current_value,
      new_value: suggestion.suggested_value,
      action: "rejected",
      actor_user_id: userId,
    });

    return { data: { success: true, action: "rejected", suggestion_id: suggestionId } };
  }

  if (action === "snooze") {
    await supabase
      .from("contact_field_suggestions")
      .update({
        status: "snoozed",
        snoozed_until: snoozeUntil || null,
        acted_by_user_id: userId,
        acted_at: new Date().toISOString(),
      })
      .eq("id", suggestionId);

    await supabase.from("contact_field_suggestion_audit").insert({
      suggestion_id: suggestionId,
      contact_id: suggestion.contact_id,
      field_name: suggestion.field_name,
      old_value: suggestion.current_value,
      new_value: suggestion.suggested_value,
      action: "snoozed",
      actor_user_id: userId,
    });

    return { data: { success: true, action: "snoozed", suggestion_id: suggestionId } };
  }

  return { error: "Invalid action", status: 400 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Authenticate user
    const userId = await getUserId(req, supabaseUrl, anonKey);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action, suggestion_id, suggestion_ids, snooze_until } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "action is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bulk actions
    if (action === "bulk_accept" || action === "bulk_reject") {
      const ids = suggestion_ids || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "suggestion_ids array is required for bulk actions" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const baseAction = action.replace("bulk_", "");
      const results = [];
      for (const id of ids.slice(0, 50)) {
        const result = await processSuggestion(supabase, id, baseAction, userId);
        results.push({ suggestion_id: id, ...result });
      }

      return new Response(
        JSON.stringify({ results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single action
    if (!suggestion_id) {
      return new Response(
        JSON.stringify({ error: "suggestion_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await processSuggestion(supabase, suggestion_id, action, userId, snooze_until);
    
    if (result.error) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(result.data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("field-suggestion-action error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

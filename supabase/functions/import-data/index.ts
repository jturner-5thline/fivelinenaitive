import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Order matters for foreign key dependencies
const IMPORT_ORDER = [
  "profiles",
  "deals",
  "deal_lenders",
  "deal_milestones",
  "deal_attachments",
  "deal_status_notes",
  "deal_flag_notes",
  "lender_notes_history",
  "lender_attachments",
  "activity_logs",
  "outstanding_items",
  "notification_reads",
  "login_history",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { targetUrl, targetServiceKey, exportedData } = await req.json();

    if (!targetUrl || !targetServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing targetUrl or targetServiceKey" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!exportedData || !exportedData.data) {
      return new Response(
        JSON.stringify({ error: "Missing exportedData. Pass the JSON from export-data function." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client for target Supabase project
    const targetSupabase = createClient(targetUrl, targetServiceKey, {
      auth: { persistSession: false },
    });

    const results: Record<string, { inserted: number; errors: string[] }> = {};
    const data = exportedData.data;

    for (const tableName of IMPORT_ORDER) {
      const tableData = data[tableName];
      results[tableName] = { inserted: 0, errors: [] };

      if (!tableData || tableData.length === 0) {
        continue;
      }

      // Insert in batches of 100 to avoid timeouts
      const batchSize = 100;
      for (let i = 0; i < tableData.length; i += batchSize) {
        const batch = tableData.slice(i, i + batchSize);
        
        const { error } = await targetSupabase
          .from(tableName)
          .upsert(batch, { 
            onConflict: "id",
            ignoreDuplicates: false 
          });

        if (error) {
          results[tableName].errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          results[tableName].inserted += batch.length;
        }
      }
    }

    // Summary
    const summary = {
      success: true,
      tables: results,
      totalInserted: Object.values(results).reduce((sum, r) => sum + r.inserted, 0),
      tablesWithErrors: Object.entries(results)
        .filter(([_, r]) => r.errors.length > 0)
        .map(([name]) => name),
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Authenticate the user first
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with the user's token to verify authentication
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    // Check if user is an admin using service role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: isAdmin, error: adminError } = await serviceClient
      .rpc('is_admin', { _user_id: userId });

    if (adminError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required for data import' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin user ${userId} starting data import...`);

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
      importedBy: userId,
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

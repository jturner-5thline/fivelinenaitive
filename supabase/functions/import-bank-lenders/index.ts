import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BankLenderRow {
  name: string;
  geo?: string;
  min_revenue?: number;
  max_deal?: number;
  min_deal?: number;
  contact_name?: string;
  contact_title?: string;
  email?: string;
  lender_type: string;
  industries?: string[];
  deal_structure_notes?: string;
}

// Parse the markdown table rows from the parsed document
function parseMarkdownTableRow(row: string): string[] {
  // Split by | and trim, filtering empty entries
  return row
    .split("|")
    .map((cell) => cell.trim().replace(/\\/g, ""))
    .filter((_, index, arr) => index > 0 && index < arr.length - 1);
}

// Convert decimal to millions (e.g., 2.00 -> 2000000)
function parseDecimalToMillions(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  
  // Handle range format like "0.01 - 2.00" - take the max
  if (value.includes("-")) {
    const parts = value.split("-").map((p) => p.trim());
    const numbers = parts.map((p) => parseFloat(p)).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      return Math.max(...numbers) * 1_000_000;
    }
    return null;
  }
  
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

// Parse min value from range
function parseMinFromRange(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  
  if (value.includes("-")) {
    const parts = value.split("-").map((p) => p.trim());
    const numbers = parts.map((p) => parseFloat(p)).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      return Math.min(...numbers) * 1_000_000;
    }
    return null;
  }
  
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

// Parse industries from comma-separated string
function parseIndustries(value: string | undefined): string[] | null {
  if (!value || value.trim() === "") return null;
  return value.split(",").map((i) => i.trim()).filter((i) => i.length > 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows } = await req.json();

    if (!rows || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const lendersToInsert: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      if (!row.name || row.name.trim() === "") {
        errors.push(`Row ${i + 1}: Missing lender name`);
        continue;
      }

      const lender = {
        user_id: user.id,
        name: row.name.trim(),
        lender_type: "Bank", // Force all to be "Bank"
        geo: row.geo || null,
        min_revenue: row.min_revenue != null ? row.min_revenue : null,
        max_deal: row.max_deal != null ? row.max_deal : null,
        min_deal: row.min_deal != null ? row.min_deal : null,
        contact_name: row.contact_name || null,
        contact_title: row.contact_title || null,
        email: row.email || null,
        industries: row.industries || null,
        deal_structure_notes: row.description || null,
      };

      lendersToInsert.push(lender);
    }

    // Insert in batches
    const batchSize = 100;
    let successCount = 0;

    for (let i = 0; i < lendersToInsert.length; i += batchSize) {
      const batch = lendersToInsert.slice(i, i + batchSize);
      
      const { data, error: insertError } = await adminClient
        .from("master_lenders")
        .insert(batch)
        .select();

      if (insertError) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`);
      } else {
        successCount += data?.length || 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported: successCount,
        failed: lendersToInsert.length - successCount + errors.length,
        total: rows.length,
        errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error importing bank lenders:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

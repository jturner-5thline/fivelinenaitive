import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FinancialYear {
  year: string;
  revenue: string;
  rev_growth?: string;
  gross_margin?: string;
  ebitda?: string;
}

interface KeyItem {
  title: string;
  description: string;
}

interface CompanyHighlight {
  title: string;
  description: string;
}

interface DealPayload {
  // Core Info
  company_name?: string;
  companyName?: string;
  id?: string;
  deal_id?: string;
  dealId?: string;
  industry?: string;
  state?: string;
  deal_type?: string;
  dealType?: string;
  is_published?: boolean;
  isPublished?: boolean;
  
  // Deal Overview
  description?: string;
  capital_ask?: string | number;
  capitalAsk?: string | number;
  use_of_funds?: string;
  useOfFunds?: string;
  existing_debt?: string;
  existingDebt?: string;
  
  // Company Overview
  billing_model?: string;
  billingModel?: string;
  profitability?: string;
  gross_margins?: string;
  grossMargins?: string;
  year_founded?: string;
  yearFounded?: string;
  headcount?: string;
  accounting_system?: string;
  accountingSystem?: string;
  company_url?: string;
  companyUrl?: string;
  linkedin_url?: string;
  linkedinUrl?: string;
  
  // Financial Table
  this_year_revenue?: string | number;
  thisYearRevenue?: string | number;
  last_year_revenue?: string | number;
  lastYearRevenue?: string | number;
  financial_years?: FinancialYear[];
  financialYears?: FinancialYear[];
  
  // Complex Fields
  key_items?: KeyItem[];
  keyItems?: KeyItem[];
  company_highlights?: CompanyHighlight[];
  companyHighlights?: CompanyHighlight[];
}

interface SyncPayload {
  action: "deal_created" | "deal_updated" | "sync_deals";
  deal?: DealPayload;
  deals?: DealPayload[];
}

// Helper to get value from snake_case or camelCase
function getValue<T>(obj: DealPayload, snakeKey: keyof DealPayload, camelKey: keyof DealPayload): T | undefined {
  return (obj[snakeKey] ?? obj[camelKey]) as T | undefined;
}

// Format currency values
function formatCurrency(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
  if (isNaN(num)) return null;
  return `$${num.toLocaleString('en-US')}`;
}

// Map incoming deal to writeup format
function mapDealToWriteup(deal: DealPayload, userId: string, dealId: string) {
  const companyName = getValue<string>(deal, 'company_name', 'companyName');
  
  if (!companyName) {
    throw new Error('company_name is required');
  }

  return {
    deal_id: dealId,
    user_id: userId,
    company_name: companyName,
    company_url: getValue<string>(deal, 'company_url', 'companyUrl') || null,
    linkedin_url: getValue<string>(deal, 'linkedin_url', 'linkedinUrl') || null,
    industry: deal.industry || null,
    location: deal.state || null,
    deal_type: getValue<string>(deal, 'deal_type', 'dealType') || null,
    billing_model: getValue<string>(deal, 'billing_model', 'billingModel') || null,
    profitability: deal.profitability || null,
    gross_margins: getValue<string>(deal, 'gross_margins', 'grossMargins') || null,
    year_founded: getValue<string>(deal, 'year_founded', 'yearFounded') || null,
    headcount: deal.headcount || null,
    capital_ask: formatCurrency(getValue<string | number>(deal, 'capital_ask', 'capitalAsk')),
    accounting_system: getValue<string>(deal, 'accounting_system', 'accountingSystem') || null,
    use_of_funds: getValue<string>(deal, 'use_of_funds', 'useOfFunds') || null,
    existing_debt_details: getValue<string>(deal, 'existing_debt', 'existingDebt') || null,
    description: deal.description || null,
    key_items: getValue<KeyItem[]>(deal, 'key_items', 'keyItems') || null,
    company_highlights: getValue<CompanyHighlight[]>(deal, 'company_highlights', 'companyHighlights') || null,
    financial_years: getValue<FinancialYear[]>(deal, 'financial_years', 'financialYears') || null,
    status: getValue<boolean>(deal, 'is_published', 'isPublished') ? 'Published' : 'Draft',
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate sync key
    const syncKey = req.headers.get("x-sync-key");
    const expectedKey = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    
    if (!syncKey || syncKey !== expectedKey) {
      console.error("Invalid or missing sync key");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid or missing x-sync-key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload
    const payload: SyncPayload = await req.json();
    console.log("Received sync payload:", JSON.stringify({ action: payload.action, hasDeal: !!payload.deal, dealCount: payload.deals?.length }));

    // Validate action
    if (!["deal_created", "deal_updated", "sync_deals"].includes(payload.action)) {
      return new Response(
        JSON.stringify({ error: "Bad Request", message: `Invalid action: ${payload.action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: { success: boolean; company_name?: string; error?: string }[] = [];

    // Process deals based on action
    const dealsToProcess = payload.action === "sync_deals" 
      ? (payload.deals || []) 
      : (payload.deal ? [payload.deal] : []);

    if (dealsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "Bad Request", message: "No deals provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const deal of dealsToProcess) {
      try {
        const companyName = getValue<string>(deal, 'company_name', 'companyName');
        const externalDealId = getValue<string>(deal, 'deal_id', 'dealId') || deal.id;
        
        if (!companyName) {
          results.push({ success: false, error: "Missing company_name" });
          continue;
        }

        // Try to find existing deal by external ID or company name
        let dealId: string | null = null;
        let userId: string | null = null;

        // First try by external ID in deals table
        if (externalDealId) {
          const { data: existingDeal } = await supabase
            .from('deals')
            .select('id, user_id')
            .eq('id', externalDealId)
            .maybeSingle();
          
          if (existingDeal) {
            dealId = existingDeal.id;
            userId = existingDeal.user_id;
          }
        }

        // If not found, try by company name in writeups
        if (!dealId) {
          const { data: existingWriteup } = await supabase
            .from('deal_writeups')
            .select('deal_id, user_id')
            .eq('company_name', companyName)
            .maybeSingle();
          
          if (existingWriteup) {
            dealId = existingWriteup.deal_id;
            userId = existingWriteup.user_id;
          }
        }

        // If still no deal found, we need a user context - skip for now
        if (!dealId || !userId) {
          console.log(`No existing deal found for company: ${companyName}, external_id: ${externalDealId}`);
          results.push({ 
            success: false, 
            company_name: companyName, 
            error: "No matching deal found. Create deal in nAItive first." 
          });
          continue;
        }

        // Map and upsert the writeup
        const writeupData = mapDealToWriteup(deal, userId, dealId);
        
        const { error: upsertError } = await supabase
          .from('deal_writeups')
          .upsert(writeupData, { 
            onConflict: 'deal_id',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error(`Error upserting writeup for ${companyName}:`, upsertError);
          results.push({ success: false, company_name: companyName, error: upsertError.message });
        } else {
          console.log(`Successfully synced writeup for ${companyName}`);
          results.push({ success: true, company_name: companyName });
          
          // Log activity
          await supabase.from('activity_logs').insert({
            deal_id: dealId,
            user_id: userId,
            activity_type: 'flex_sync_received',
            description: `Deal write-up synced from Flex: ${companyName}`,
          });
        }
      } catch (dealError) {
        const errorMessage = dealError instanceof Error ? dealError.message : 'Unknown error';
        console.error("Error processing deal:", errorMessage);
        results.push({ success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: failureCount === 0,
        message: `Processed ${dealsToProcess.length} deal(s): ${successCount} succeeded, ${failureCount} failed`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in naitive-flex-sync:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error", 
        message: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

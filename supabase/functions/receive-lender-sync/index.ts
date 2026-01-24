import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};

interface IncomingLender {
  id?: string;
  name: string;
  email?: string;
  lender_type?: string;
  loan_types?: string[];
  sub_debt?: string;
  cash_burn?: string;
  sponsorship?: string;
  min_revenue?: number;
  ebitda_min?: number;
  min_deal?: number;
  max_deal?: number;
  industries?: string[];
  industries_to_avoid?: string[];
  b2b_b2c?: string;
  refinancing?: string;
  company_requirements?: string;
  deal_structure_notes?: string;
  geo?: string;
  contact_name?: string;
  contact_title?: string;
  relationship_owners?: string;
  lender_one_pager_url?: string;
  referral_lender?: string;
  referral_fee_offered?: string;
  referral_agreement?: string;
  nda?: string;
  onboarded_to_flex?: string;
  upfront_checklist?: string;
  post_term_sheet_checklist?: string;
  gift_address?: string;
  tier?: string;
  active?: boolean;
  updated_at?: string;
}

interface SyncPayload {
  event: "lender_created" | "lender_updated" | "sync_lenders";
  source?: string;
  lender?: IncomingLender;
  lenders?: IncomingLender[];
}

// Fields to compare for detecting changes
const COMPARE_FIELDS = [
  "email", "lender_type", "loan_types", "sub_debt", "cash_burn", "sponsorship",
  "min_revenue", "ebitda_min", "min_deal", "max_deal", "industries", 
  "industries_to_avoid", "b2b_b2c", "refinancing", "company_requirements",
  "deal_structure_notes", "geo", "contact_name", "contact_title",
  "relationship_owners", "lender_one_pager_url", "referral_lender",
  "referral_fee_offered", "referral_agreement", "nda", "onboarded_to_flex",
  "upfront_checklist", "post_term_sheet_checklist", "gift_address", "tier", "active"
];

function computeDiff(existing: Record<string, unknown>, incoming: IncomingLender): Record<string, { old: unknown; new: unknown }> | null {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  
  for (const field of COMPARE_FIELDS) {
    const oldVal = existing[field];
    const newVal = incoming[field as keyof IncomingLender];
    
    // Skip if both are null/undefined
    if (oldVal == null && newVal == null) continue;
    
    // Check if values are different
    const oldStr = JSON.stringify(oldVal ?? null);
    const newStr = JSON.stringify(newVal ?? null);
    
    if (oldStr !== newStr) {
      diff[field] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }
  
  return Object.keys(diff).length > 0 ? diff : null;
}

function normalizeNameForComparison(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify sync key
    const syncKey = req.headers.get("x-sync-key");
    const expectedKey = Deno.env.get("NAITIVE_FLEX_SYNC_KEY");
    
    if (!expectedKey || syncKey !== expectedKey) {
      console.error("Invalid or missing sync key");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: SyncPayload = await req.json();
    console.log("Received lender sync payload:", JSON.stringify(payload));

    const { event, lender, lenders } = payload;

    // Collect all lenders to process
    const lendersToProcess: IncomingLender[] = [];
    if (lender) lendersToProcess.push(lender);
    if (lenders) lendersToProcess.push(...lenders);

    if (lendersToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No lenders provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all existing lenders for comparison
    const { data: existingLenders, error: fetchError } = await supabase
      .from("master_lenders")
      .select("*");

    if (fetchError) {
      console.error("Error fetching existing lenders:", fetchError);
      throw fetchError;
    }

    // Build a map of normalized names to existing lenders
    const existingByName = new Map<string, typeof existingLenders[0]>();
    const existingByFlexId = new Map<string, typeof existingLenders[0]>();
    
    for (const existing of existingLenders || []) {
      existingByName.set(normalizeNameForComparison(existing.name), existing);
      if (existing.flex_lender_id) {
        existingByFlexId.set(existing.flex_lender_id, existing);
      }
    }

    const results = {
      new_lenders: 0,
      updates: 0,
      merge_conflicts: 0,
      no_changes: 0,
      errors: [] as string[],
    };

    for (const incoming of lendersToProcess) {
      try {
        if (!incoming.name) {
          results.errors.push("Lender missing name field");
          continue;
        }

        const normalizedName = normalizeNameForComparison(incoming.name);
        
        // Check if we have this lender by flex_lender_id first, then by name
        let existingLender = incoming.id ? existingByFlexId.get(incoming.id) : null;
        if (!existingLender) {
          existingLender = existingByName.get(normalizedName);
        }

        if (!existingLender) {
          // New lender - create pending sync request
          console.log(`New lender from Flex: ${incoming.name}`);
          
          const { error: insertError } = await supabase
            .from("lender_sync_requests")
            .insert({
              source_system: "flex",
              source_lender_id: incoming.id || null,
              request_type: "new_lender",
              incoming_data: incoming,
              status: "pending",
            });

          if (insertError) {
            console.error("Error creating sync request:", insertError);
            results.errors.push(`Failed to create request for ${incoming.name}: ${insertError.message}`);
          } else {
            results.new_lenders++;
          }
        } else {
          // Existing lender - check for changes
          const diff = computeDiff(existingLender, incoming);
          
          if (!diff) {
            // No changes
            results.no_changes++;
            continue;
          }

          // Determine if this is an update or merge conflict
          // If the lender was originally from naitive (sync_source = 'naitive'), it's a merge conflict
          // If it was from flex, it's a regular update
          const isNaitiveLender = existingLender.sync_source === "naitive" || !existingLender.sync_source;
          const requestType = isNaitiveLender ? "merge_conflict" : "update_existing";

          console.log(`${requestType} for lender: ${incoming.name}`, diff);

          // Check if there's already a pending request for this lender
          const { data: existingRequest } = await supabase
            .from("lender_sync_requests")
            .select("id")
            .eq("existing_lender_id", existingLender.id)
            .eq("status", "pending")
            .single();

          if (existingRequest) {
            // Update the existing request with new data
            const { error: updateError } = await supabase
              .from("lender_sync_requests")
              .update({
                incoming_data: incoming,
                changes_diff: diff,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingRequest.id);

            if (updateError) {
              results.errors.push(`Failed to update request for ${incoming.name}: ${updateError.message}`);
            }
          } else {
            // Create new sync request
            const { error: insertError } = await supabase
              .from("lender_sync_requests")
              .insert({
                source_system: "flex",
                source_lender_id: incoming.id || null,
                request_type: requestType,
                incoming_data: incoming,
                existing_lender_id: existingLender.id,
                existing_lender_name: existingLender.name,
                changes_diff: diff,
                status: "pending",
              });

            if (insertError) {
              results.errors.push(`Failed to create request for ${incoming.name}: ${insertError.message}`);
            } else {
              if (requestType === "merge_conflict") {
                results.merge_conflicts++;
              } else {
                results.updates++;
              }
            }
          }
        }
      } catch (lenderError) {
        const msg = lenderError instanceof Error ? lenderError.message : "Unknown error";
        results.errors.push(`Error processing ${incoming.name}: ${msg}`);
      }
    }

    console.log("Lender sync results:", results);

    // Send email notifications to admin users if there are new pending requests
    const totalPending = results.new_lenders + results.updates + results.merge_conflicts;
    if (totalPending > 0) {
      try {
        // Get users with admin role who should receive notifications
        const { data: adminUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        if (adminUsers && adminUsers.length > 0) {
          // Get the first lender name for context in single-item notifications
          const firstLenderName = lendersToProcess[0]?.name || "Unknown";
          const primaryType = results.new_lenders > 0 ? "new_lender" 
            : results.merge_conflicts > 0 ? "merge_conflict" 
            : "update_existing";

          // Send notification to each admin
          for (const admin of adminUsers) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  type: "flex_lender_sync",
                  user_id: admin.user_id,
                  lender_name: firstLenderName,
                  sync_request_type: primaryType,
                  sync_count: totalPending,
                }),
              });
            } catch (emailError) {
              console.error(`Failed to send notification to admin ${admin.user_id}:`, emailError);
            }
          }
          console.log(`Sent email notifications to ${adminUsers.length} admin users`);
        }
      } catch (notifyError) {
        console.error("Error sending email notifications:", notifyError);
        // Don't fail the request if notifications fail
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${lendersToProcess.length} lenders`,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Error in receive-lender-sync function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_DEALS = [
  {
    company: "Acme Corp",
    value: 15000000,
    status: "active",
    stage: "Due Diligence",
    engagement_type: "Exclusive",
    deal_type: "Refinancing",
    manager: "Sarah Chen",
    referred_by: "Goldman Sachs",
  },
  {
    company: "TechStart Inc",
    value: 8500000,
    status: "active",
    stage: "Initial Review",
    engagement_type: "Retained",
    deal_type: "Acquisition",
    manager: "Michael Roberts",
    referred_by: "JP Morgan",
  },
  {
    company: "Global Logistics LLC",
    value: 25000000,
    status: "active",
    stage: "Term Sheet",
    engagement_type: "Exclusive",
    deal_type: "Growth Capital",
    manager: "Sarah Chen",
    referred_by: "Direct",
  },
  {
    company: "HealthTech Solutions",
    value: 12000000,
    status: "active",
    stage: "Due Diligence",
    engagement_type: "Retained",
    deal_type: "Recapitalization",
    manager: "Jennifer Walsh",
    referred_by: "Referral Partner",
  },
  {
    company: "Green Energy Partners",
    value: 50000000,
    status: "active",
    stage: "Closing",
    engagement_type: "Exclusive",
    deal_type: "Project Finance",
    manager: "Sarah Chen",
    referred_by: "Morgan Stanley",
  },
  {
    company: "Retail Innovations",
    value: 5000000,
    status: "on-hold",
    stage: "Initial Review",
    engagement_type: "Success Fee",
    deal_type: "Working Capital",
    manager: "Michael Roberts",
    referred_by: "Direct",
  },
  {
    company: "Manufacturing Plus",
    value: 18000000,
    status: "closed",
    stage: "Closed",
    engagement_type: "Exclusive",
    deal_type: "Refinancing",
    manager: "Jennifer Walsh",
    referred_by: "Bank of America",
  },
];

const DEMO_LENDERS = [
  { name: "First National Bank", stage: "reviewing-drl" },
  { name: "Capital One", stage: "dd" },
  { name: "Wells Fargo", stage: "term-sheet" },
  { name: "Chase", stage: "reviewing-drl" },
  { name: "Bank of America", stage: "passed" },
  { name: "Goldman Sachs", stage: "dd" },
  { name: "Morgan Stanley", stage: "term-sheet" },
  { name: "Citi", stage: "reviewing-drl" },
];

Deno.serve(async (req) => {
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create user client to get current user
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has deals
    const { data: existingDeals, error: checkError } = await supabaseAdmin
      .from("deals")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    if (existingDeals && existingDeals.length > 0) {
      return new Response(JSON.stringify({ 
        message: "Demo data already exists", 
        seeded: false 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert demo deals
    const dealsToInsert = DEMO_DEALS.map(deal => ({
      ...deal,
      user_id: user.id,
    }));

    const { data: insertedDeals, error: insertError } = await supabaseAdmin
      .from("deals")
      .insert(dealsToInsert)
      .select();

    if (insertError) {
      throw insertError;
    }

    // Add lenders to the first 4 deals
    const lendersToInsert = [];
    for (let i = 0; i < Math.min(4, insertedDeals.length); i++) {
      const dealLenders = DEMO_LENDERS.slice(i * 2, i * 2 + 2);
      for (const lender of dealLenders) {
        lendersToInsert.push({
          deal_id: insertedDeals[i].id,
          name: lender.name,
          stage: lender.stage,
          notes: `Initial outreach completed for ${insertedDeals[i].company}`,
        });
      }
    }

    if (lendersToInsert.length > 0) {
      const { error: lenderError } = await supabaseAdmin
        .from("deal_lenders")
        .insert(lendersToInsert);

      if (lenderError) {
        console.error("Error inserting lenders:", lenderError);
      }
    }

    return new Response(JSON.stringify({ 
      message: "Demo data seeded successfully", 
      seeded: true,
      dealsCreated: insertedDeals.length 
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error seeding demo data:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

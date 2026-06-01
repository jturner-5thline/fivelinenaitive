import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const resolveDefaultPipeline = async (resolvedCompanyId: string, resolvedUserId: string) => {
      const { data: pipeline, error: pipelineError } = await supabase
        .from("deal_pipelines")
        .select("id, stages")
        .eq("company_id", resolvedCompanyId)
        .eq("is_default", true)
        .maybeSingle();

      if (pipelineError) {
        console.error("Failed to load default pipeline for sample deal seeding:", {
          user_id: resolvedUserId,
          company_id: resolvedCompanyId,
          error: pipelineError,
        });
        return null;
      }

      if (!pipeline) {
        console.error("No default pipeline found for sample deal seeding:", {
          user_id: resolvedUserId,
          company_id: resolvedCompanyId,
        });
        return null;
      }

      const stages = Array.isArray(pipeline.stages)
        ? (pipeline.stages as Array<{ id?: string }> )
        : [];

      return {
        pipelineId: pipeline.id,
        defaultStage: stages[1]?.id || stages[0]?.id || "qualification",
      };
    };

    // Resolve company_id: prefer a valid provided value, otherwise use the user's current membership.
    let resolvedCompanyId = company_id || null;
    if (resolvedCompanyId) {
      const { data: existingCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("id", resolvedCompanyId)
        .maybeSingle();

      if (!existingCompany) {
        resolvedCompanyId = null;
      }
    }

    if (!resolvedCompanyId) {
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user_id)
        .limit(1)
        .maybeSingle();
      resolvedCompanyId = membership?.company_id || null;
    }

    // Check company_features flag if company exists
    if (resolvedCompanyId) {
      const { data: features } = await supabase
        .from("company_features")
        .select("sample_deal_on_signup")
        .eq("company_id", resolvedCompanyId)
        .maybeSingle();

      if (features && features.sample_deal_on_signup === false) {
        return new Response(JSON.stringify({ seeded: false, reason: "disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let pipelineId: string | null = null;
    let defaultStage = "qualification";

    if (resolvedCompanyId) {
      const pipelineConfig = await resolveDefaultPipeline(resolvedCompanyId, user_id);
      if (pipelineConfig) {
        pipelineId = pipelineConfig.pipelineId;
        defaultStage = pipelineConfig.defaultStage;
      }
    }

    if (!resolvedCompanyId || !pipelineId) {
      console.error("Aborting sample deal seed because workspace pipeline is unavailable:", {
        user_id,
        company_id: resolvedCompanyId,
        pipeline_id: pipelineId,
      });
      return new Response(JSON.stringify({ seeded: false, reason: "missing_default_pipeline" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If the seeded sample deal already exists, attach it to the user's company/pipeline
    // instead of bailing out. This fixes signups where the deal was created before the
    // workspace/pipeline existed.
    const { data: existingSampleDeal } = await supabase
      .from("deals")
      .select("id, company, company_id, pipeline_id, stage")
      .eq("user_id", user_id)
      .in("company", ["Example Deal", "EXAMPLE DEAL"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSampleDeal) {
      const updates: Record<string, unknown> = {};

      if (existingSampleDeal.company !== "EXAMPLE DEAL") {
        updates.company = "EXAMPLE DEAL";
      }

      if (resolvedCompanyId && existingSampleDeal.company_id !== resolvedCompanyId) {
        updates.company_id = resolvedCompanyId;
        updates.migrated_from_personal = existingSampleDeal.company_id === null;
      }

      if (pipelineId && existingSampleDeal.pipeline_id !== pipelineId) {
        updates.pipeline_id = pipelineId;
      }

      if (existingSampleDeal.stage !== defaultStage) {
        updates.stage = defaultStage;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("deals")
          .update(updates)
          .eq("id", existingSampleDeal.id);

        if (updateError) {
          console.error("Failed to update existing sample deal:", updateError);
          return new Response(JSON.stringify({ error: "Failed to update sample deal", details: updateError }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ seeded: true, repaired: true, deal_id: existingSampleDeal.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has deals
    const { data: existingDeals } = await supabase
      .from("deals")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    if (existingDeals && existingDeals.length > 0) {
      return new Response(JSON.stringify({ seeded: false, reason: "already_has_deals" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get lender pipeline stages
    let lenderStages: { id: string; label: string }[] = [];
    if (resolvedCompanyId) {
      const { data: lenderPipeline } = await supabase
        .from("lender_pipelines")
        .select("stages")
        .eq("company_id", resolvedCompanyId)
        .eq("is_default", true)
        .maybeSingle();

      if (lenderPipeline?.stages) {
        lenderStages = lenderPipeline.stages as any[];
      }
    }

    if (lenderStages.length === 0) {
      lenderStages = [
        { id: "outreach", label: "Outreach" },
        { id: "reviewing", label: "Reviewing" },
        { id: "diligence", label: "Diligence" },
        { id: "term-sheet", label: "Term Sheet" },
        { id: "passed", label: "Passed" },
      ];
    }

    const findStage = (patterns: string[], fallbackIndex: number): string => {
      for (const pattern of patterns) {
        const found = lenderStages.find((s) =>
          s.label.toLowerCase().includes(pattern.toLowerCase())
        );
        if (found) return found.id;
      }
      return lenderStages[Math.min(fallbackIndex, lenderStages.length - 1)]?.id || "outreach";
    };

    const stageOutreach = findStage(["outreach", "contacted", "sent"], 0);
    const stageReviewing = findStage(["review", "diligence"], 1);
    const stageTermSheet = findStage(["term", "offer", "draft"], Math.min(3, lenderStages.length - 1));
    const stagePassed = findStage(["pass", "declined", "closed"], lenderStages.length - 1);

    const now = new Date();
    const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
    const subDays = (d: Date, n: number) => new Date(d.getTime() - n * 86400000);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const fmtISO = (d: Date) => d.toISOString();

    // Create the sample deal
    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert({
        company: "EXAMPLE DEAL",
        value: 10000000,
        status: "active",
        stage: defaultStage,
        engagement_type: "advisory",
        deal_type: "Debt Financing",
        manager: "You",
        analyst: "Unassigned",
        referred_by: "Existing Client Referral",
        contact: "Alex Morgan, CFO",
        contact_info: "alex.morgan@examplecorp.com",
        company_url: "https://examplecorp.com",
        business_model:
          "B2B SaaS platform providing workforce management solutions to mid-market enterprises. $6.5MM ARR with 120% net revenue retention across 80+ enterprise customers.",
        narrative:
          "Example Corp is seeking $10MM in debt financing to fund geographic expansion and product development. The company has demonstrated consistent growth with strong unit economics: gross margins above 75%, CAC payback under 14 months, and a clear path to profitability within 18 months. Management team has deep industry experience with two prior successful exits.",
        user_id,
        company_id: resolvedCompanyId,
        pipeline_id: pipelineId,
        notes:
          "**This is an example deal** to help you explore the platform.\n\nDeal Overview:\n- $10MM debt financing for growth capital\n- Strong recurring revenue base ($6.5MM ARR)\n- Multiple lenders engaged at various stages\n- Target close in 60 days\n\nNext Steps:\n1. Complete management presentations with shortlisted lenders\n2. Compare incoming term sheets\n3. Negotiate final terms with selected lender\n\nFeel free to edit or delete this deal at any time.",
        closing_date: fmt(addDays(now, 60)),
        sourced_via: "Referral",
        total_fee: 200000,
        retainer_fee: 25000,
        success_fee_percent: 1.75,
        pre_signing_hours: 45,
        post_signing_hours: 12,
        exclusivity: "Yes — 90 days",
      })
      .select()
      .single();

    if (dealError || !deal) {
      console.error("Failed to create sample deal:", dealError);
      return new Response(JSON.stringify({ error: "Failed to create deal", details: dealError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add lenders
    await supabase.from("deal_lenders").insert([
      {
        deal_id: deal.id, name: "Summit Growth Partners", stage: stageTermSheet,
        tracking_status: "active", notes: "Strong interest from day one. Term sheet received at $10MM, 36-month term, 10.75% fixed rate.",
        quote_amount: 10000000, quote_rate: 10.75, quote_term: "36 months", score: 9,
      },
      {
        deal_id: deal.id, name: "Horizon Capital Group", stage: stageReviewing,
        tracking_status: "active", notes: "Preliminary terms shared verbally: $8-10MM range, floating rate at SOFR + 450bps.",
        quote_amount: 9000000, quote_rate: 11.25, quote_term: "48 months", score: 7,
      },
      {
        deal_id: deal.id, name: "Meridian Lending Corp", stage: stageReviewing,
        tracking_status: "active", notes: "Full package sent last Monday. Credit committee review is scheduled for next week.",
        score: 6,
      },
      {
        deal_id: deal.id, name: "Pacific Coast Finance", stage: stageOutreach,
        tracking_status: "active", notes: "Warm intro made via our network. Information package sent.",
      },
      {
        deal_id: deal.id, name: "Atlas Venture Debt", stage: stageOutreach,
        tracking_status: "active", notes: "Initial outreach sent. Strong track record with SaaS companies in the $5-15MM range.",
      },
      {
        deal_id: deal.id, name: "Keystone Business Credit", stage: stagePassed,
        tracking_status: "passed", pass_reason: "Industry sector not within current lending mandate.",
        notes: "Passed — sector mismatch.",
      },
    ]);

    // Add milestones
    await supabase.from("deal_milestones").insert([
      { title: "Engagement Letter Signed", due_date: fmtISO(subDays(now, 14)), completed: true, completed_at: fmtISO(subDays(now, 14)), position: 0, deal_id: deal.id, user_id },
      { title: "Financial Model Received", due_date: fmtISO(subDays(now, 10)), completed: true, completed_at: fmtISO(subDays(now, 9)), position: 1, deal_id: deal.id, user_id },
      { title: "Initial Lender Outreach", due_date: fmtISO(subDays(now, 7)), completed: true, completed_at: fmtISO(subDays(now, 7)), position: 2, deal_id: deal.id, user_id },
      { title: "Management Presentations", due_date: fmtISO(addDays(now, 5)), completed: false, position: 3, deal_id: deal.id, user_id },
      { title: "Term Sheet Comparison", due_date: fmtISO(addDays(now, 14)), completed: false, position: 4, deal_id: deal.id, user_id },
      { title: "Final Lender Selection", due_date: fmtISO(addDays(now, 30)), completed: false, position: 5, deal_id: deal.id, user_id },
      { title: "Credit Agreement Review", due_date: fmtISO(addDays(now, 45)), completed: false, position: 6, deal_id: deal.id, user_id },
      { title: "Closing & Funding", due_date: fmtISO(addDays(now, 60)), completed: false, position: 7, deal_id: deal.id, user_id },
    ]);

    // Add activity logs
    await supabase.from("activity_logs").insert([
      { deal_id: deal.id, user_id, activity_type: "deal_created", description: "Deal created — EXAMPLE DEAL, $10.00MM Debt Financing", user_display_name: "You", created_at: fmtISO(subDays(now, 14)) },
      { deal_id: deal.id, user_id, activity_type: "milestone_completed", description: "Milestone completed: Engagement Letter Signed", user_display_name: "You", created_at: fmtISO(subDays(now, 14)) },
      { deal_id: deal.id, user_id, activity_type: "note_added", description: "Received financial model and 3-year projections from client.", user_display_name: "You", created_at: fmtISO(subDays(now, 9)) },
      { deal_id: deal.id, user_id, activity_type: "lender_added", description: "Added 6 lenders to the deal for outreach", user_display_name: "You", created_at: fmtISO(subDays(now, 7)) },
      { deal_id: deal.id, user_id, activity_type: "stage_change", description: "Summit Growth Partners moved to Term Sheet stage — $10MM at 10.75%", user_display_name: "You", created_at: fmtISO(subDays(now, 2)) },
      { deal_id: deal.id, user_id, activity_type: "note_added", description: "Summit Growth Partners term sheet: $10MM, 10.75% fixed, 36-month term.", user_display_name: "You", created_at: fmtISO(subDays(now, 1)) },
    ]);

    console.log("Sample deal seeded successfully for user:", user_id, "company:", resolvedCompanyId);

    return new Response(JSON.stringify({ seeded: true, deal_id: deal.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error seeding sample deal:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

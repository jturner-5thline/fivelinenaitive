import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  provisionDemoWorkspace,
  splitMissingCounts,
  validateDemoSeed,
  type DemoCounts,
} from "../_shared/provisionDemoWorkspace.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  companyId?: string;
  userEmail?: string;
  renameTo?: string;
}

type RepairStatus = "ok" | "warning" | "fatal";

interface RepairResponse {
  status: RepairStatus;
  message: string;
  createdCounts: Partial<DemoCounts>;
  missingCounts: Partial<DemoCounts>;
  canOpenWorkspace: boolean;
  repairPerformed: boolean;
  warnings?: string[];
  companyId?: string;
  attributedUserId?: string | null;
  memberIds?: string[];
  renamed?: boolean;
  seeded?: unknown;
  error?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);
    const caller = authData.user;

    const { data: roleRow } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    let companyId = body.companyId ?? null;
    let demoUserId: string | null = null;

    // Resolve by user email if companyId not supplied.
    if (!companyId && body.userEmail) {
      const email = body.userEmail.toLowerCase().trim();
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => x.email?.toLowerCase() === email);
      if (!u) return json(fatal(`No auth user for ${email}`, { error: "missing_linked_demo_user" }), 404);
      demoUserId = u.id;
      const { data: memberships } = await admin
        .from("company_members")
        .select("company_id, companies!inner(id, is_demo, created_at)")
        .eq("user_id", u.id);
      const demoMembership = (memberships ?? []).find((m) => {
        const c = (m as { companies?: { is_demo?: boolean } }).companies;
        return c?.is_demo === true;
      });
      companyId = demoMembership?.company_id ?? memberships?.[0]?.company_id ?? null;
      if (!companyId) return json(fatal(`User ${email} has no company`, { error: "missing_linked_demo_user" }), 404);
    }

    if (!companyId) return json(fatal("companyId or userEmail required", { error: "missing_tenant" }), 400);

    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("id, name, is_demo")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr || !company) {
      console.error("[repair-demo-tenant] fatal missing tenant", { companyId, error: companyErr?.message });
      return json(fatal("Demo tenant not found", { error: companyErr?.message ?? "missing_tenant", companyId }), 404);
    }

    // Resolve a member to attribute seed rows to.
    if (!demoUserId) {
      const { data: members } = await admin
        .from("company_members")
        .select("user_id, role")
        .eq("company_id", companyId)
        .order("role", { ascending: true });
      demoUserId = members?.[0]?.user_id as string | undefined ?? null;
    }
    if (!demoUserId) {
      console.error("[repair-demo-tenant] fatal missing linked demo user", { companyId });
      return json(fatal("No linked demo user exists for this tenant", { error: "missing_linked_demo_user", companyId }), 404);
    }

    // Optional rename (the canonical provisioner handles all demo flags).
    if (body.renameTo?.trim()) {
      await admin.from("companies").update({ name: body.renameTo.trim() }).eq("id", companyId);
    }

    const { data: companyMembers } = await admin
      .from("company_members").select("user_id").eq("company_id", companyId);
    const memberIds = (companyMembers ?? []).map((m) => m.user_id as string);

    const beforeValidation = await validateDemoSeed(admin, companyId);
    const beforeSplit = splitMissingCounts(beforeValidation.missing);
    console.log("[repair-demo-tenant] validation branch", {
      companyId,
      demoUserId,
      memberIds,
      beforeCounts: beforeValidation.counts,
      beforeMissing: beforeValidation.missing,
      repairableMissing: beforeSplit.repairableMissing,
      fatalMissing: beforeSplit.fatalMissing,
      pipelineId: beforeValidation.pipelineId,
    });

    // Single canonical provisioning service. Same code path as create.
    try {
      console.log("[repair-demo-tenant] reseed branch", {
        companyId,
        categories: Object.keys(beforeValidation.missing),
      });
      const seeded = await provisionDemoWorkspace(admin, {
        companyId,
        attributingUserId: demoUserId,
        memberUserIds: memberIds.length ? memberIds : [demoUserId],
      });

      const afterValidation = await validateDemoSeed(admin, companyId);
      const afterSplit = splitMissingCounts(afterValidation.missing);
      const hasWarnings =
        (seeded.warnings && seeded.warnings.length > 0) ||
        Object.keys(afterSplit.repairableMissing).length > 0;
      const hasFatalGaps = Object.keys(afterSplit.fatalMissing).length > 0 || !afterValidation.pipelineId;

      console.log("[repair-demo-tenant] post-repair counts", {
        companyId,
        createdCounts: seeded.insertedThisRun,
        afterCounts: afterValidation.counts,
        afterMissing: afterValidation.missing,
        repairableMissing: afterSplit.repairableMissing,
        fatalMissing: afterSplit.fatalMissing,
        warnings: seeded.warnings ?? [],
        canOpenWorkspace: !hasFatalGaps,
      });

      if (hasFatalGaps) {
        return json(fatal("Demo workspace has required seed gaps that could not be repaired.", {
          companyId,
          attributedUserId: demoUserId,
          memberIds,
          createdCounts: seeded.insertedThisRun,
          missingCounts: afterSplit.fatalMissing,
          warnings: seeded.warnings ?? [],
          seeded,
        }), 409);
      }

      return json({
        status: hasWarnings ? "warning" : "ok",
        message: hasWarnings
          ? "Demo workspace repaired with nonblocking warnings."
          : "Demo workspace repaired successfully.",
        repairPerformed: true,
        canOpenWorkspace: true,
        companyId,
        attributedUserId: demoUserId,
        memberIds,
        renamed: !!body.renameTo,
        createdCounts: seeded.insertedThisRun,
        missingCounts: afterSplit.repairableMissing,
        warnings: seeded.warnings ?? [],
        seeded,
      } satisfies RepairResponse, 200);
    } catch (provErr) {
      const e = provErr as Error & { fatalMissing?: Record<string, number>; warnings?: string[] };
      const postFailureValidation = await validateDemoSeed(admin, companyId).catch(() => null);
      const postFailureSplit = postFailureValidation ? splitMissingCounts(postFailureValidation.missing) : null;
      console.error("[repair-demo-tenant] fatal provisioning failure", e.message, {
        fatalMissing: e.fatalMissing,
        warnings: e.warnings,
        postFailureCounts: postFailureValidation?.counts,
        postFailureMissing: postFailureValidation?.missing,
        repairableMissing: postFailureSplit?.repairableMissing,
        fatalMissingAfterFailure: postFailureSplit?.fatalMissing,
      });

      const missingCounts = e.fatalMissing ?? postFailureSplit?.fatalMissing ?? {};
      return json(fatal(e.message, {
        companyId,
        attributedUserId: demoUserId,
        memberIds,
        missingCounts,
        warnings: e.warnings ?? [],
      }), 409);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[repair-demo-tenant] fatal unhandled", { message: msg, stack: err instanceof Error ? err.stack : undefined });
    return json(fatal(msg, { error: msg }), 500);
  }
});

function fatal(message: string, extra: Partial<RepairResponse> = {}): RepairResponse {
  return {
    status: "fatal",
    message,
    createdCounts: extra.createdCounts ?? {},
    missingCounts: extra.missingCounts ?? {},
    canOpenWorkspace: false,
    repairPerformed: extra.repairPerformed ?? false,
    warnings: extra.warnings ?? [],
    ...extra,
  };
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
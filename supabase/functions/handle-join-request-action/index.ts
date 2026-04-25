import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// HMAC-based token verification for email action links
async function createHmacToken(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyHmacToken(data: string, token: string, secret: string): Promise<boolean> {
  const expected = await createHmacToken(data, secret);
  return expected === token;
}

function htmlResponse(title: string, message: string, success: boolean): Response {
  const color = success ? "#22c55e" : "#ef4444";
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — naitive</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 40px; max-width: 420px; text-align: center; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 12px; color: ${color}; }
  p { font-size: 14px; color: #999; line-height: 1.5; margin: 0; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">${success ? "✅" : "⚠️"}</div>
  <h1>${title}</h1>
  <p>${message}</p>
</div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("request_id");
  const action = url.searchParams.get("action"); // "approve" or "reject"
  const token = url.searchParams.get("token");
  const adminUserId = url.searchParams.get("admin_id");

  if (!requestId || !action || !token || !adminUserId) {
    return htmlResponse("Invalid Link", "This action link is missing required parameters.", false);
  }

  if (action !== "approve" && action !== "reject") {
    return htmlResponse("Invalid Action", "The action must be 'approve' or 'reject'.", false);
  }

  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tokenData = `${requestId}:${action}:${adminUserId}`;
  const valid = await verifyHmacToken(tokenData, token, secret);

  if (!valid) {
    return htmlResponse("Invalid Token", "This action link has an invalid or expired signature.", false);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    secret
  );

  // Check that admin is still an admin/owner of the company
  const { data: joinRequest } = await supabaseAdmin
    .from("company_join_requests")
    .select("*, companies:company_id(name)")
    .eq("id", requestId)
    .single();

  if (!joinRequest) {
    return htmlResponse("Request Not Found", "This join request no longer exists.", false);
  }

  if (joinRequest.status !== "pending") {
    const statusLabel = joinRequest.status === "approved" ? "approved" : "rejected";
    return htmlResponse("Already Processed", `This join request has already been ${statusLabel}.`, false);
  }

  // Verify admin membership
  const { data: adminMember } = await supabaseAdmin
    .from("company_members")
    .select("role")
    .eq("company_id", joinRequest.company_id)
    .eq("user_id", adminUserId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!adminMember) {
    return htmlResponse("Not Authorized", "You are no longer an admin of this company.", false);
  }

  const companyName = (joinRequest.companies as any)?.name || "the company";

  if (action === "approve") {
    // Update request status
    await supabaseAdmin
      .from("company_join_requests")
      .update({ status: "approved", decision_at: new Date().toISOString(), decided_by_user_id: adminUserId })
      .eq("id", requestId);

    // Add user to company
    await supabaseAdmin
      .from("company_members")
      .upsert({ company_id: joinRequest.company_id, user_id: joinRequest.user_id, role: "member" }, { onConflict: "company_id,user_id" });

    // Also approve the user in the platform if not yet approved
    await supabaseAdmin.rpc("admin_approve_user_service", { _user_id: joinRequest.user_id }).catch(() => {
      // Function may not exist, that's OK
    });

    return htmlResponse("Access Granted", `The user has been approved and added to ${companyName}.`, true);
  } else {
    await supabaseAdmin
      .from("company_join_requests")
      .update({ status: "rejected", decision_at: new Date().toISOString(), decided_by_user_id: adminUserId, rejection_note: "Declined via email" })
      .eq("id", requestId);

    return htmlResponse("Access Declined", `The join request for ${companyName} has been declined.`, true);
  }
});

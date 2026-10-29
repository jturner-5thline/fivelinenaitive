// Shared request authentication for edge functions.
//
// Internal callers (pg_cron jobs, database triggers) send the
// `x-internal-cron-secret` header, whose value lives in a service-role-only
// table and is verified through the `verify_internal_function_secret` RPC.
// Function-to-function calls may instead present the service role key.
// Browser callers must present a valid user JWT.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const INTERNAL_AUTH_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-internal-cron-secret, x-cron-secret";

function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

function bearer(req: Request): string {
  const h = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/** True when the request comes from a trusted internal caller (cron, DB trigger, or service role). */
export async function isInternalCaller(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = bearer(req);
  if (serviceKey && token && token === serviceKey) return true;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const legacy = req.headers.get("x-cron-secret");
  if (cronSecret && ((legacy && legacy === cronSecret) || token === cronSecret)) return true;
  const secret = req.headers.get("x-internal-cron-secret");
  if (!secret) return false;
  try {
    const { data, error } = await serviceClient().rpc("verify_internal_function_secret", { p_secret: secret });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Returns the signed-in user for the request's JWT, or null. */
export async function getRequestUser(req: Request): Promise<User | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    const { data, error } = await serviceClient().auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { data } = await serviceClient().rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

/** Returns true when the user is a member of the company. */
export async function isCompanyMember(userId: string, companyId: string): Promise<boolean> {
  if (!userId || !companyId) return false;
  const { data } = await serviceClient()
    .from("company_members")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !!data;
}

/** Returns true when the user can access the deal (via the can_access_deal RPC). */
export async function canAccessDeal(req: Request, dealId: string): Promise<boolean> {
  const token = bearer(req);
  if (!token || !dealId) return false;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await client.from("deals").select("id").eq("id", dealId).maybeSingle();
  return !!data;
}

export type AuthResult =
  | { ok: true; internal: true; user: null }
  | { ok: true; internal: false; user: User }
  | { ok: false; response: Response };

function deny(status: number, cors: Record<string, string>, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Only internal callers (cron, triggers, service role). Optionally allow platform admins. */
export async function requireInternal(
  req: Request,
  cors: Record<string, string>,
  opts: { allowAdmin?: boolean; allowUser?: boolean } = {},
): Promise<AuthResult> {
  if (await isInternalCaller(req)) return { ok: true, internal: true, user: null };
  if (opts.allowAdmin || opts.allowUser) {
    const user = await getRequestUser(req);
    if (user && (opts.allowUser || (await isPlatformAdmin(user.id)))) {
      return { ok: true, internal: false, user };
    }
    if (user) return { ok: false, response: deny(403, cors, "Forbidden") };
  }
  return { ok: false, response: deny(401, cors, "Unauthorized") };
}

/** Signed-in user or internal caller. */
export async function requireUserOrInternal(req: Request, cors: Record<string, string>): Promise<AuthResult> {
  return requireInternal(req, cors, { allowUser: true });
}

/** Signed-in user only. */
export async function requireUser(req: Request, cors: Record<string, string>): Promise<AuthResult> {
  const user = await getRequestUser(req);
  if (!user) return { ok: false, response: deny(401, cors, "Unauthorized") };
  return { ok: true, internal: false, user };
}

/** Restrict AI chat messages to user/assistant roles with string content. */
export function sanitizeChatMessages(messages: unknown, maxMessages = 100): Array<{ role: "user" | "assistant"; content: any }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && m.content != null)
    .slice(-maxMessages)
    .map((m: any) => ({ role: m.role, content: m.content }));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function maskEmail(email: unknown): string {
  const s = String(email ?? "");
  const [u, d] = s.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}***@${d}`;
}

/** True when `email` belongs to the caller or to a user sharing a company with the caller. */
export async function isTeammateEmail(userId: string, callerEmail: string | null | undefined, email: string): Promise<boolean> {
  const target = String(email ?? "").trim().toLowerCase();
  if (!target) return false;
  if (callerEmail && callerEmail.trim().toLowerCase() === target) return true;
  const svc = serviceClient();
  const { data: profiles } = await svc.from("profiles").select("user_id").ilike("email", target).limit(5);
  const ids = (profiles ?? []).map((p: { user_id: string }) => p.user_id);
  if (ids.length === 0) return false;
  const { data: mine } = await svc.from("company_members").select("company_id").eq("user_id", userId);
  const companyIds = (mine ?? []).map((m: { company_id: string }) => m.company_id);
  if (companyIds.length === 0) return false;
  const { data: shared } = await svc.from("company_members").select("user_id").in("company_id", companyIds).in("user_id", ids).limit(1);
  return (shared ?? []).length > 0;
}

/** True when `email` is a teammate or a saved contact in one of the caller's companies. */
export async function isKnownRecipient(userId: string, callerEmail: string | null | undefined, email: string): Promise<boolean> {
  if (await isTeammateEmail(userId, callerEmail, email)) return true;
  const target = String(email ?? "").trim().toLowerCase();
  const svc = serviceClient();
  const { data: mine } = await svc.from("company_members").select("company_id").eq("user_id", userId);
  const companyIds = (mine ?? []).map((m: { company_id: string }) => m.company_id);
  if (!target || companyIds.length === 0) return false;
  const { data } = await svc.from("contacts").select("id").in("company_id", companyIds).ilike("email", target).limit(1);
  return (data ?? []).length > 0;
}

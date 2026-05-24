// Allow-listed AI settings tool registry. Shared by ai-settings-tool (dry-run)
// and ai-settings-apply (commit + undo). Adding a new key here is the ONLY way
// to expose a new setting to the Ask-AI bar.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Scope = "company" | "user";

export interface ToolContext {
  sb: SupabaseClient;
  company_id: string;
  user_id: string;
}

export interface ValidationResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface ToolEntry {
  key: string;
  human_name: string;
  description: string;
  settings_tab: string;
  scope: Scope;
  target_table: string;
  target_column: string;
  aliases: string[]; // lowercase noun phrases for cheap classifier
  validator: (raw: unknown) => ValidationResult;
  json_schema: Record<string, unknown>;
  dry_run_query: (ctx: ToolContext) => Promise<unknown>;
  apply_mutation: (ctx: ToolContext, value: unknown) => Promise<{ old: unknown; new: unknown }>;
  audit_event: string;
}

// ---------- validators ----------
const IANA_TZ = new Set([
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Toronto",
  "Europe/London","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Amsterdam",
  "Asia/Tokyo","Asia/Singapore","Asia/Hong_Kong","Asia/Dubai","Asia/Kolkata",
  "Australia/Sydney","UTC",
]);

const vString = (min = 1, max = 8000) => (raw: unknown): ValidationResult => {
  if (typeof raw !== "string") return { ok: false, error: "must be a string" };
  const v = raw.trim();
  if (v.length < min) return { ok: false, error: `min length ${min}` };
  if (v.length > max) return { ok: false, error: `max length ${max}` };
  return { ok: true, value: v };
};
const vEmail = (raw: unknown): ValidationResult => {
  if (typeof raw !== "string") return { ok: false, error: "must be a string" };
  const v = raw.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: "invalid email" };
  return { ok: true, value: v };
};
const vBool = (raw: unknown): ValidationResult => {
  if (typeof raw === "boolean") return { ok: true, value: raw };
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (["true","on","yes","enable","enabled","1"].includes(s)) return { ok: true, value: true };
    if (["false","off","no","disable","disabled","0"].includes(s)) return { ok: true, value: false };
  }
  return { ok: false, error: "must be boolean" };
};
const vEnum = (allowed: string[]) => (raw: unknown): ValidationResult => {
  if (typeof raw !== "string") return { ok: false, error: "must be a string" };
  const v = raw.trim();
  if (!allowed.includes(v)) return { ok: false, error: `must be one of: ${allowed.join(", ")}` };
  return { ok: true, value: v };
};
const vTz = (raw: unknown): ValidationResult => {
  if (typeof raw !== "string") return { ok: false, error: "must be a string" };
  const v = raw.trim();
  if (!IANA_TZ.has(v)) return { ok: false, error: "must be a valid IANA timezone" };
  return { ok: true, value: v };
};
const vGcalId = (raw: unknown): ValidationResult => {
  if (typeof raw !== "string") return { ok: false, error: "must be a string" };
  const v = raw.trim();
  if (!/^[\w.@+-]+$/.test(v)) return { ok: false, error: "invalid calendar id" };
  return { ok: true, value: v };
};

// ---------- shared helpers ----------
async function getCompanySettingsValue(
  ctx: ToolContext,
  path: string[],
): Promise<unknown> {
  const { data } = await ctx.sb
    .from("company_settings")
    .select("value")
    .eq("company_id", ctx.company_id)
    .maybeSingle();
  let cur: any = data?.value ?? {};
  for (const seg of path) cur = cur?.[seg];
  return cur ?? null;
}

async function setCompanySettingsValue(
  ctx: ToolContext,
  path: string[],
  newValue: unknown,
): Promise<{ old: unknown; new: unknown }> {
  const { data: existing } = await ctx.sb
    .from("company_settings")
    .select("value")
    .eq("company_id", ctx.company_id)
    .maybeSingle();
  const base = (existing?.value as Record<string, unknown> | null) ?? {};
  const cloned: any = JSON.parse(JSON.stringify(base));
  let cursor = cloned;
  for (let i = 0; i < path.length - 1; i++) {
    cursor[path[i]] = cursor[path[i]] ?? {};
    cursor = cursor[path[i]];
  }
  const leaf = path[path.length - 1];
  const old = cursor[leaf] ?? null;
  cursor[leaf] = newValue;
  const { error } = await ctx.sb
    .from("company_settings")
    .upsert({ company_id: ctx.company_id, value: cloned }, { onConflict: "company_id" });
  if (error) throw new Error(error.message);
  return { old, new: newValue };
}

// ---------- registry ----------
export const REGISTRY: ToolEntry[] = [
  {
    key: "settings.update_company_name",
    human_name: "Company name",
    description: "The display name of your company.",
    settings_tab: "company",
    scope: "company",
    target_table: "companies",
    target_column: "name",
    aliases: ["company name","org name","organization name","workspace name","rename company","rename my company"],
    validator: vString(1, 120),
    json_schema: { type: "string", minLength: 1, maxLength: 120 },
    dry_run_query: async (ctx) => {
      const { data } = await ctx.sb.from("companies").select("name").eq("id", ctx.company_id).maybeSingle();
      return data?.name ?? null;
    },
    apply_mutation: async (ctx, value) => {
      const { data: prev } = await ctx.sb.from("companies").select("name").eq("id", ctx.company_id).maybeSingle();
      const { error } = await ctx.sb.from("companies").update({ name: value as string }).eq("id", ctx.company_id);
      if (error) throw new Error(error.message);
      return { old: prev?.name ?? null, new: value };
    },
    audit_event: "company.name.update",
  },
  {
    key: "settings.update_company_timezone",
    human_name: "Company timezone",
    description: "Default timezone for company-wide schedules and digests.",
    settings_tab: "company",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.timezone",
    aliases: ["timezone","time zone","tz"],
    validator: vTz,
    json_schema: { type: "string", description: "IANA timezone" },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["timezone"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["timezone"], value),
    audit_event: "company.timezone.update",
  },
  {
    key: "settings.update_user_theme",
    human_name: "Theme",
    description: "Your interface color scheme.",
    settings_tab: "preferences",
    scope: "user",
    target_table: "user_ui_preferences",
    target_column: "value.theme",
    aliases: ["theme","dark mode","light mode","color scheme"],
    validator: vEnum(["light","dark","system"]),
    json_schema: { type: "string", enum: ["light","dark","system"] },
    dry_run_query: async (ctx) => {
      const { data } = await ctx.sb.from("user_ui_preferences").select("value").eq("user_id", ctx.user_id).eq("preference_key","theme").maybeSingle();
      return (data?.value as any)?.theme ?? null;
    },
    apply_mutation: async (ctx, value) => {
      const { data: prev } = await ctx.sb.from("user_ui_preferences").select("value").eq("user_id", ctx.user_id).eq("preference_key","theme").maybeSingle();
      const old = (prev?.value as any)?.theme ?? null;
      const { error } = await ctx.sb.from("user_ui_preferences").upsert(
        { user_id: ctx.user_id, preference_key: "theme", value: { theme: value } },
        { onConflict: "user_id,preference_key" },
      );
      if (error) throw new Error(error.message);
      return { old, new: value };
    },
    audit_event: "user.theme.update",
  },
  {
    key: "settings.update_notification_email",
    human_name: "Notification email",
    description: "Email address that receives your notifications.",
    settings_tab: "preferences",
    scope: "user",
    target_table: "profiles",
    target_column: "notification_email",
    aliases: ["notification email","notifications email","alert email"],
    validator: vEmail,
    json_schema: { type: "string", format: "email" },
    dry_run_query: async (ctx) => {
      const { data } = await ctx.sb.from("profiles").select("notification_email").eq("id", ctx.user_id).maybeSingle();
      return (data as any)?.notification_email ?? null;
    },
    apply_mutation: async (ctx, value) => {
      const { data: prev } = await ctx.sb.from("profiles").select("notification_email").eq("id", ctx.user_id).maybeSingle();
      const { error } = await ctx.sb.from("profiles").update({ notification_email: value }).eq("id", ctx.user_id);
      if (error) throw new Error(error.message);
      return { old: (prev as any)?.notification_email ?? null, new: value };
    },
    audit_event: "user.notification_email.update",
  },
  {
    key: "settings.update_digest_frequency",
    human_name: "Digest frequency",
    description: "How often the deal digest is sent.",
    settings_tab: "notifications",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.digest_frequency",
    aliases: ["digest","digest frequency","email digest","daily digest","weekly digest"],
    validator: vEnum(["daily","weekly","off"]),
    json_schema: { type: "string", enum: ["daily","weekly","off"] },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["digest_frequency"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["digest_frequency"], value),
    audit_event: "company.digest_frequency.update",
  },
  {
    key: "settings.toggle_ai_assistant",
    human_name: "AI Assistant",
    description: "Whether the AI assistant is enabled across the workspace.",
    settings_tab: "ai",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.ai_assistant_enabled",
    aliases: ["ai assistant","ai","naitive ai","ai bar"],
    validator: vBool,
    json_schema: { type: "boolean" },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["ai_assistant_enabled"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["ai_assistant_enabled"], value),
    audit_event: "company.ai_assistant.toggle",
  },
  {
    key: "settings.toggle_ai_draft_autosend",
    human_name: "AI draft auto-send",
    description: "If on, AI email drafts are auto-sent without manual review. Default: off.",
    settings_tab: "ai",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.ai_draft_autosend",
    aliases: ["auto send","autosend","ai draft autosend","auto-send drafts"],
    validator: vBool,
    json_schema: { type: "boolean", default: false },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["ai_draft_autosend"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["ai_draft_autosend"], value),
    audit_event: "company.ai_draft_autosend.toggle",
  },
  {
    key: "settings.update_email_signature",
    human_name: "Email signature",
    description: "HTML signature appended to your outbound emails.",
    settings_tab: "preferences",
    scope: "user",
    target_table: "user_email_signatures",
    target_column: "signature_html",
    aliases: ["email signature","signature","sig"],
    validator: vString(0, 8000),
    json_schema: { type: "string", maxLength: 8000 },
    dry_run_query: async (ctx) => {
      const { data } = await ctx.sb.from("user_email_signatures").select("signature_html").eq("user_id", ctx.user_id).maybeSingle();
      return (data as any)?.signature_html ?? null;
    },
    apply_mutation: async (ctx, value) => {
      const { data: prev } = await ctx.sb.from("user_email_signatures").select("signature_html").eq("user_id", ctx.user_id).maybeSingle();
      const { error } = await ctx.sb.from("user_email_signatures").upsert(
        { user_id: ctx.user_id, signature_html: value as string },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      return { old: (prev as any)?.signature_html ?? null, new: value };
    },
    audit_event: "user.email_signature.update",
  },
  {
    key: "settings.toggle_slack_digest",
    human_name: "Slack digest",
    description: "Sends the deal digest into your Slack workspace.",
    settings_tab: "integrations",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.integrations.slack_digest_enabled",
    aliases: ["slack digest","slack","slack notifications"],
    validator: vBool,
    json_schema: { type: "boolean" },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["integrations","slack_digest_enabled"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["integrations","slack_digest_enabled"], value),
    audit_event: "company.slack_digest.toggle",
  },
  {
    key: "settings.update_gcal_default_calendar_id",
    human_name: "Default Google Calendar ID",
    description: "Calendar ID used for newly created events.",
    settings_tab: "integrations",
    scope: "company",
    target_table: "company_settings",
    target_column: "value.integrations.gcal_default_calendar_id",
    aliases: ["default calendar","google calendar id","default gcal"],
    validator: vGcalId,
    json_schema: { type: "string" },
    dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["integrations","gcal_default_calendar_id"]),
    apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["integrations","gcal_default_calendar_id"], value),
    audit_event: "company.gcal_default.update",
  },
];

export const REGISTRY_BY_KEY: Record<string, ToolEntry> = Object.fromEntries(
  REGISTRY.map((t) => [t.key, t]),
);

/** Cheap alias + verb classifier. Returns null when no confident hit. */
export function classifyByAlias(prompt: string): { tool: ToolEntry; rawValue: string | boolean | null } | null {
  const lower = prompt.toLowerCase();
  const verbs = /\b(rename|set|change|update|turn\s+(on|off)|enable|disable|switch|make|use)\b/;
  if (!verbs.test(lower)) return null;

  let best: ToolEntry | null = null;
  let bestLen = 0;
  for (const tool of REGISTRY) {
    for (const a of tool.aliases) {
      if (lower.includes(a) && a.length > bestLen) {
        best = tool;
        bestLen = a.length;
      }
    }
  }
  if (!best) return null;

  // Crude value extraction: "to <X>", "= <X>", "off"/"on", trailing quoted string.
  let rawValue: string | boolean | null = null;
  const toMatch = prompt.match(/\bto\s+["']?(.+?)["']?\s*$/i);
  if (toMatch) rawValue = toMatch[1].trim();
  else if (/\bturn\s+off|\bdisable|\boff\b/i.test(lower)) rawValue = false;
  else if (/\bturn\s+on|\benable|\bon\b/i.test(lower)) rawValue = true;

  return { tool: best, rawValue };
}
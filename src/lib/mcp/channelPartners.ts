/** Channel Partner (BD page) reads shared by the channel partner MCP tools. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANNEL_PARTNER_STAGES } from "./fieldOptions";

export const STAGE_LABELS: Record<string, string> = { prospect: "Prospect", nurturing: "Nurturing", trial: "Trial", engaged: "Engaged" };
export { CHANNEL_PARTNER_STAGES };

export async function callerCompanyId(sb: SupabaseClient, userId: string | null | undefined): Promise<string> {
  const { data, error } = await sb.from("company_members").select("company_id").eq("user_id", userId ?? "").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("forbidden: the signed-in user is not a member of a workspace.");
  return data.company_id as string;
}

type PartnerRow = { id: string; company_id: string; crm_company_id: string; stage: string; owner_user_id: string | null; created_by: string | null; created_at: string; updated_at: string; crm_companies?: Record<string, unknown> | null };

export async function hydratePartners(sb: SupabaseClient, rows: PartnerRow[], withHistory: boolean) {
  const ids = rows.map((r) => r.id);
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id).filter((v): v is string => !!v))];
  const [notesRes, ownersRes, histRes] = await Promise.all([
    ids.length ? sb.from("channel_partner_status_notes").select("id, channel_partner_id, note, created_by, created_at").in("channel_partner_id", ids).order("created_at", { ascending: false }).limit(withHistory ? 500 : 2000) : Promise.resolve({ data: [], error: null }),
    ownerIds.length ? sb.from("profiles_public").select("user_id, display_name, first_name, last_name").in("user_id", ownerIds) : Promise.resolve({ data: [], error: null }),
    withHistory && ids.length ? sb.from("channel_partner_history").select("id, channel_partner_id, event_type, from_stage, to_stage, occurred_at, actor_user_id").in("channel_partner_id", ids).order("occurred_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [notesRes, ownersRes, histRes]) if (r.error) throw new Error(r.error.message);
  const notes = (notesRes.data ?? []) as Array<Record<string, unknown>>;
  const owners = new Map(((ownersRes.data ?? []) as Array<Record<string, string | null>>).map((o) => [o.user_id, o.display_name || [o.first_name, o.last_name].filter(Boolean).join(" ") || null]));
  return rows.map((r) => {
    const mine = notes.filter((n) => n.channel_partner_id === r.id);
    const co = r.crm_companies ?? {};
    return {
      id: r.id, crm_company_id: r.crm_company_id, company_name: co.name ?? null, domain: co.domain ?? null,
      stage: r.stage, stage_label: STAGE_LABELS[r.stage] ?? r.stage, owner_user_id: r.owner_user_id, owner: r.owner_user_id ? owners.get(r.owner_user_id) ?? null : null,
      status_note: mine[0]?.note ?? null, status_note_updated_at: mine[0]?.created_at ?? null,
      last_contact_at: co.last_activity_date ?? null, next_activity_at: co.next_activity_date ?? null,
      created_at: r.created_at, updated_at: r.updated_at,
      ...(withHistory ? { status_note_history: mine, stage_history: ((histRes.data ?? []) as Array<Record<string, unknown>>).filter((h) => h.channel_partner_id === r.id) } : {}),
    };
  });
}

export const PARTNER_SELECT = "id, company_id, crm_company_id, stage, owner_user_id, created_by, created_at, updated_at, crm_companies(name, domain, last_activity_date, next_activity_date)";
export type { PartnerRow };

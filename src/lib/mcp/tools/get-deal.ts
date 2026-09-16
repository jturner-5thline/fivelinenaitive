import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess, withStageLabels } from "../supabase";

function contactName(contact: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}) {
  const composed = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  const fullName = contact.full_name?.trim();
  if (fullName && fullName.toLowerCase() !== contact.email?.toLowerCase()) return fullName;
  return contact.email ?? "Unnamed contact";
}

/** Tables that hang directly off a deal via `deal_id`. */
const DEAL_CHILD_TABLES: Array<[key: string, table: string]> = [
  ["milestones", "deal_milestones"],
  ["stage_history", "deal_stage_history"],
  ["stage_history_notes", "deal_stage_history_notes"],
  ["status_notes", "deal_status_notes"],
  ["status_report_drafts", "deal_status_report_drafts"],
  ["flag_notes", "deal_flag_notes"],
  ["ownership", "deal_ownership"],
  ["advance_reasons", "deal_advance_reasons"],
  ["aliases", "deal_aliases"],
  ["access_requests", "deal_access_requests"],
  ["audit_log", "deal_audit_log"],
  ["checklist_status", "deal_checklist_status"],
  ["attachments", "deal_attachments"],
  ["writeups", "deal_writeups"],
  ["memos", "deal_memos"],
  ["memo_approvals", "deal_memo_approvals"],
  ["memo_comments", "deal_memo_comments"],
  ["memo_views", "deal_memo_views"],
  ["memo_audit_logs", "deal_memo_audit_logs"],
  ["notes", "deal_space_notes"],
  ["space_documents", "deal_space_documents"],
  ["space_conversations", "deal_space_conversations"],
  ["space_financials", "deal_space_financials"],
  ["financial_data", "deal_financial_data"],
  ["financial_files", "deal_financial_files"],
  ["financial_insights", "deal_financial_insights"],
  ["computed_metrics", "deal_computed_metrics"],
  ["drive_folders", "deal_drive_folders"],
  ["data_room_folders", "deal_data_room_custom_folders"],
  ["document_exclusions", "deal_document_exclusions"],
  ["emails", "deal_emails"],
  ["email_prompts", "deal_email_prompts"],
  ["client_requests", "client_requests"],
  ["meeting_history", "deal_meeting_history"],
  ["meeting_links", "meeting_deal_links"],
  ["meeting_holds", "meeting_holds"],
  ["call_transcripts", "deal_call_transcripts"],
  ["claap_recordings", "deal_claap_recordings"],
  ["calendar_items", "deal_calendar_items"],
  ["activity", "deal_activity"],
  ["ai_settings", "deal_ai_settings"],
  ["ai_status_snapshots", "deal_ai_status_snapshots"],
  ["research_cache", "deal_research_cache"],
  ["fit_profiles", "deal_fit_profiles"],
  ["kpi_links", "deal_kpi_links"],
  ["saas_model", "deal_saas_model"],
  ["saas_mappings", "deal_saas_mappings"],
  ["saas_sensitivity", "deal_saas_sensitivity"],
  ["finserv_projects", "finserv_deal_projects"],
  ["lender_recommendation_exclusions", "deal_lender_recommendation_exclusions"],
  ["pending_suggestions", "pending_deal_suggestions"],
  ["pending_notifications", "pending_deal_notifications"],
];

const CHILD_ROW_LIMIT = 200;

export default defineTool({
  name: "get_deal",
  title: "Get deal",
  description:
    "Fetch a single deal by id with its full record, linked client contacts, recent status notes, tasks, and attached lenders. Set include_related=true to also return everything attached to the deal: milestones, stage history and stage notes, status notes and report drafts, flag notes, ownership, checklist status, attachments, write-ups, memos (with approvals, comments, views, audit), deal-space notes/documents/conversations/messages, financial data, files, insights and computed metrics, drive and data-room folders, emails and email prompts, client requests, meeting history, links, holds, call transcripts and Claap recordings, calendar items, activity, AI settings and snapshots, research cache, fit profiles, KPI links, SaaS/FinServ models, and task detail (comments, attachments, collaborators, followers, time entries, activity). Always report stage_label, not the raw stage id (ids are overloaded per pipeline).",
  inputSchema: {
    deal_id: z.string().uuid(),
    include_tasks: z.boolean().default(true),
    include_lenders: z.boolean().default(true),
    include_related: z.boolean().default(false),
    include_task_detail: z.boolean().default(false),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, include_tasks, include_lenders, include_related, include_task_detail }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "get_deal");
    if (denied) return denied;
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", deal_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!deal) return errorResult("Deal not found or you do not have access.");

    const [tasksRes, lendersRes, contactLinksRes] = await Promise.all([
      include_tasks
        ? sb
            .from("tasks")
            .select("id, title, status, due_date, priority, assigned_to, created_at")
            .eq("deal_id", deal_id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null, error: null }),
      include_lenders
        ? sb
            .from("deal_lenders")
            .select("id, lender_id, status, stage, updated_at")
            .eq("deal_id", deal_id)
            .order("updated_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null, error: null }),
      sb
        .from("contact_deals")
        .select("contact_id, role, created_at")
        .eq("deal_id", deal_id)
        .order("created_at", { ascending: true }),
    ]);
    if (contactLinksRes.error) return errorResult(contactLinksRes.error.message);

    const contactLinks = contactLinksRes.data ?? [];
    const contactIds = contactLinks.map((link) => link.contact_id).filter(Boolean);
    let clientContacts: Array<{
      id: string;
      name: string;
      email: string | null;
      job_title: string | null;
      is_primary: boolean;
    }> = [];

    if (contactIds.length > 0) {
      const { data: contacts, error: contactsError } = await sb
        .from("contacts")
        .select("id, first_name, last_name, full_name, email, job_title")
        .in("id", contactIds);
      if (contactsError) return errorResult(contactsError.message);

      const contactsById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
      clientContacts = contactLinks
        .map((link) => {
          const contact = contactsById.get(link.contact_id);
          if (!contact) return null;
          return {
            id: contact.id,
            name: contactName(contact),
            email: contact.email ?? null,
            job_title: contact.job_title ?? null,
            is_primary: (link.role ?? "").toLowerCase() === "primary",
          };
        })
        .filter((contact): contact is NonNullable<typeof contact> => contact !== null)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    }

    const [dealWithLabels] = await withStageLabels(sb, [deal as Record<string, unknown> & { stage?: string | null; pipeline_id?: string | null }]);

    const related: Record<string, unknown> = {};
    if (include_related) {
      const results = await Promise.all(
        DEAL_CHILD_TABLES.map(async ([key, table]) => {
          const { data, error: childError } = await (sb as any)
            .from(table)
            .select("*")
            .eq("deal_id", deal_id)
            .limit(CHILD_ROW_LIMIT);
          // A missing or RLS-blocked child table must never fail the whole lookup.
          if (childError) return [key, { error: childError.message }] as const;
          return [key, data ?? []] as const;
        }),
      );
      for (const [key, value] of results) {
        if (Array.isArray(value) && value.length === 0) continue;
        related[key] = value;
      }

      // Second-level children that hang off deal-space rows rather than the deal.
      const noteIds = ((related.notes as Array<{ id?: string }> | undefined) ?? [])
        .map((r) => r.id)
        .filter(Boolean) as string[];
      const conversationIds = ((related.space_conversations as Array<{ id?: string }> | undefined) ?? [])
        .map((r) => r.id)
        .filter(Boolean) as string[];
      const documentIds = ((related.space_documents as Array<{ id?: string }> | undefined) ?? [])
        .map((r) => r.id)
        .filter(Boolean) as string[];
      const nested: Array<[string, string, string, string[]]> = [
        ["note_versions", "deal_space_note_versions", "note_id", noteIds],
        ["note_comments", "deal_space_note_comments", "note_id", noteIds],
        ["space_messages", "deal_space_messages", "conversation_id", conversationIds],
        ["document_summaries", "deal_space_document_summaries", "document_id", documentIds],
      ];
      await Promise.all(
        nested.map(async ([key, table, column, ids]) => {
          if (ids.length === 0) return;
          const { data, error: nestedError } = await (sb as any)
            .from(table)
            .select("*")
            .in(column, ids.slice(0, CHILD_ROW_LIMIT))
            .limit(500);
          if (nestedError) {
            related[key] = { error: nestedError.message };
            return;
          }
          if ((data ?? []).length > 0) related[key] = data;
        }),
      );
    }

    let taskDetail: Record<string, unknown> | undefined;
    if (include_task_detail) {
      const taskIds = ((tasksRes.data ?? []) as Array<{ id?: string }>).map((t) => t.id).filter(Boolean) as string[];
      taskDetail = {};
      if (taskIds.length > 0) {
        const taskChildren: Array<[string, string]> = [
          ["comments", "task_comments"],
          ["attachments", "task_attachments"],
          ["collaborators", "task_collaborators"],
          ["followers", "task_followers"],
          ["watchers", "task_watchers"],
          ["mentions", "task_mentions"],
          ["dependencies", "task_dependencies"],
          ["label_assignments", "task_label_assignments"],
          ["tag_assignments", "task_tag_assignments"],
          ["time_entries", "task_time_entries"],
          ["activity", "task_activity"],
        ];
        await Promise.all(
          taskChildren.map(async ([key, table]) => {
            const { data, error: taskError } = await (sb as any)
              .from(table)
              .select("*")
              .in("task_id", taskIds)
              .limit(500);
            if (taskError) {
              taskDetail![key] = { error: taskError.message };
              return;
            }
            if ((data ?? []).length > 0) taskDetail![key] = data;
          }),
        );
      }
    }

    return textResult({
      deal: dealWithLabels,
      client_contacts: clientContacts,
      tasks: tasksRes.data ?? [],
      lenders: lendersRes.data ?? [],
      ...(include_related ? { related } : {}),
      ...(taskDetail ? { task_detail: taskDetail } : {}),
    });
  },
});

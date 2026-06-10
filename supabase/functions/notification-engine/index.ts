import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotifyPayload {
  triggerKey: string;
  actorUserId?: string;
  context: Record<string, unknown>;
}

// Trigger keys that count as "stale-activity / reminder" and are subject to
// the global suppression rule for deals in On Hold / Archived / Closed Won /
// Closed Lost. NON-stale triggers (e.g. lender_access_request, deal_assigned)
// are NOT in this list and continue to fire normally.
const STALE_ACTIVITY_TRIGGER_PREFIXES = [
  'stale_',                       // stale_deal_alert, stale_lender_alert, ...
  'deal.followup.',               // deal.followup.morning_digest, deal.followup.created_3d, ...
  'deal.attention.',              // deal.attention.* digests
  'lenders_needing_attention',    // attention digest
  'lender_attention',
  // Outstanding-item / checklist / data-room reminders & nudges. These are
  // proactive and should be skipped when the deal is closed/inactive.
  'outstanding_item',
  'item_requested_by_lender',
  'items_received',
  'info_requested_via_flex',
  'client_no_response',
  'lender_no_response',
  'deal_milestone_past_due',
  'milestone_missed',
  'task_overdue',
  'task_due_soon',
  'task_reminder',
  'checklist',                    // checklist_nudge, etc.
  'data_room',                    // data_room_completion_prompt, etc.
  'ai_suggestion',                // AI-suggested deal-info fills
];

function isStaleActivityTrigger(triggerKey: string): boolean {
  const k = (triggerKey || '').toLowerCase();
  return STALE_ACTIVITY_TRIGGER_PREFIXES.some((p) => k.startsWith(p));
}

const HARD_SUPPRESSED_DEAL_STATES = new Set<string>([
  'archived',
  'on hold', 'on-hold', 'on_hold',
  'closed won', 'closed-won', 'closed_won', 'won',
  'closed lost', 'closed-lost', 'closed_lost', 'lost',
  'funded', 'funded / invoiced', 'funded-invoiced', 'funded_invoiced',
  'in due diligence', 'in-due-diligence', 'in_due_diligence',
]);

function normState(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

async function writeAudit(
  supabase: ReturnType<typeof createClient>,
  row: {
    trigger_key: string;
    recipient_user_id: string | null;
    deal_id: string | null;
    channel: string;
    status: string;
    title?: string | null;
    body?: string | null;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from("notification_audit").insert({
      trigger_key: row.trigger_key,
      recipient_user_id: row.recipient_user_id ?? null,
      deal_id: row.deal_id,
      channel: row.channel,
      status: row.status,
      title: row.title ?? null,
      body: row.body ?? null,
      error_message: row.error_message ?? null,
      metadata: row.metadata ?? {},
    });
  } catch (e) {
    console.error("notification_audit insert failed:", e);
  }
}

interface ChannelConfig {
  channel_type: string;
  is_enabled: boolean;
  template: {
    title?: string;
    subject?: string;
    body: string;
  };
}

interface NotificationRule {
  id: string;
  trigger_key: string;
  is_enabled: boolean;
  channels: ChannelConfig[];
  default_recipients: {
    roles?: string[];
    user_ids?: string[];
    scope?: string;
  };
  metadata: Record<string, unknown>;
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(context[key] ?? "");
  });
}

async function resolveUserIdByDisplayName(
  supabase: ReturnType<typeof createClient>,
  displayName: string | null | undefined,
  companyId?: string | null
): Promise<string | null> {
  if (!displayName || typeof displayName !== "string" || !displayName.trim()) return null;
  const name = displayName.trim();

  // Try exact match on display_name within the same company
  let query = supabase
    .from("profiles")
    .select("user_id")
    .ilike("display_name", name)
    .limit(1);

  if (companyId) {
    // Prefer members of the same company
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id, profiles!inner(display_name)")
      .eq("company_id", companyId);

    if (members) {
      const match = members.find(
        (m: any) => m.profiles?.display_name?.toLowerCase() === name.toLowerCase()
      );
      if (match) return match.user_id;
    }
  }

  const { data } = await query;
  return data?.[0]?.user_id || null;
}

/**
 * Per-recipient resolution metadata. Each recipient may be resolved via one
 * or more roles (e.g. the deal manager who is also an admin) — we track the
 * full set so the audit log can attribute correctly.
 *
 * `fallback_to_owner` is true when the rule asked for DEAL_MANAGER but the
 * manager could not be resolved, so the deal owner was used instead. This is
 * surfaced into notification_audit.metadata for visibility.
 */
interface RecipientMeta {
  roles: Set<string>;
  fallback_to_owner: boolean;
}

async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  rule: NotificationRule,
  context: Record<string, unknown>,
  actorUserId?: string
): Promise<Map<string, RecipientMeta>> {
  const recipientMap = new Map<string, RecipientMeta>();
  const addRecipient = (uid: string, role: string, fallback = false) => {
    if (!uid) return;
    const existing = recipientMap.get(uid);
    if (existing) {
      existing.roles.add(role);
      if (fallback) existing.fallback_to_owner = true;
    } else {
      recipientMap.set(uid, {
        roles: new Set([role]),
        fallback_to_owner: fallback,
      });
    }
  };

  // Add explicit user IDs
  if (rule.default_recipients.user_ids) {
    for (const uid of rule.default_recipients.user_ids) {
      addRecipient(uid, "EXPLICIT");
    }
  }

  // If we have a deal_id but no resolved owner/manager IDs, look them up from the deal record
  const dealId = context.deal_id as string | undefined;
  let resolvedDealCompanyId: string | null = null;
  if (dealId) {
    const { data: deal } = await supabase
      .from("deals")
      .select("user_id, manager, analyst, deal_owner, company_id")
      .eq("id", dealId)
      .maybeSingle();

    if (deal) {
      const companyId = (deal.company_id as string | null) || (context.company_id as string | undefined) || null;
      resolvedDealCompanyId = companyId;
      // Expose for downstream resolvers (ADMIN scoping)
      if (!context.company_id && companyId) context.company_id = companyId;

      // Resolve deal_owner (text name) to user ID, fallback to user_id (creator)
      if (!context.deal_owner_id) {
        const resolvedOwner = await resolveUserIdByDisplayName(supabase, deal.deal_owner, companyId);
        context.deal_owner_id = resolvedOwner || deal.user_id;
      }

      // Resolve manager (text name) to user ID
      if (!context.deal_manager_ids) {
        const resolvedManager = await resolveUserIdByDisplayName(supabase, deal.manager, companyId);
        if (resolvedManager) {
          context.deal_manager_ids = [resolvedManager];
        }
      }

      // Resolve analyst (text name) to user ID
      if (!context.analyst_ids) {
        const resolvedAnalyst = await resolveUserIdByDisplayName(supabase, deal.analyst, companyId);
        if (resolvedAnalyst) {
          context.analyst_ids = [resolvedAnalyst];
        }
      }
    }
  }

  // Resolve role-based recipients
  if (rule.default_recipients.roles) {
    const requestedRoles = rule.default_recipients.roles;
    const wantsManager = requestedRoles.includes("DEAL_MANAGER");
    const wantsOwner = requestedRoles.includes("DEAL_OWNER");
    let managerResolved = false;

    for (const role of requestedRoles) {
      switch (role) {
        case "DEAL_OWNER":
          if (context.deal_owner_id) addRecipient(String(context.deal_owner_id), "DEAL_OWNER");
          break;
        case "DEAL_MANAGER":
          if (context.deal_manager_ids && Array.isArray(context.deal_manager_ids)) {
            for (const id of context.deal_manager_ids) {
              addRecipient(String(id), "DEAL_MANAGER");
              managerResolved = true;
            }
          }
          break;
        case "ANALYST":
          if (context.analyst_ids && Array.isArray(context.analyst_ids)) {
            for (const id of context.analyst_ids) addRecipient(String(id), "ANALYST");
          }
          break;
        case "ASSIGNEE":
          if (context.assignee_id) addRecipient(String(context.assignee_id), "ASSIGNEE");
          break;
        case "TAGGED_USER":
          if (context.tagged_user_id) addRecipient(String(context.tagged_user_id), "TAGGED_USER");
          break;
        case "ADMIN": {
          // Scope admins to the deal's company when we know it; otherwise fall back to global admins.
          const adminCompanyId =
            resolvedDealCompanyId ||
            (typeof context.company_id === "string" ? (context.company_id as string) : null);

          if (adminCompanyId) {
            // Find users who are members of this company AND have the global 'admin' role.
            const { data: members } = await supabase
              .from("company_members")
              .select("user_id")
              .eq("company_id", adminCompanyId);
            const memberIds = (members || []).map((m: any) => m.user_id);
            if (memberIds.length > 0) {
              const { data: admins } = await supabase
                .from("user_roles")
                .select("user_id")
                .eq("role", "admin")
                .in("user_id", memberIds);
              if (admins) {
                for (const a of admins) addRecipient(a.user_id, "ADMIN");
              }
            }
          } else {
            const { data: admins } = await supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin");
            if (admins) {
              for (const a of admins) addRecipient(a.user_id, "ADMIN");
            }
          }
          break;
        }
      }
    }

    // Fallback: rule wanted DEAL_MANAGER but none could be resolved.
    // Fall back to the deal owner so the message still reaches a human, and
    // flag fallback_to_owner=true so the audit log shows it was a fallback.
    if (wantsManager && !managerResolved && !wantsOwner && context.deal_owner_id) {
      addRecipient(String(context.deal_owner_id), "DEAL_OWNER", /*fallback*/ true);
    }
  }

  // Remove actor to avoid self-notification (unless metadata says otherwise)
  if (actorUserId && !rule.metadata?.notify_actor) {
    recipientMap.delete(actorUserId);
  }

  return recipientMap;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: NotifyPayload = await req.json();
    const { triggerKey, actorUserId, context } = payload;

    if (!triggerKey) {
      return new Response(JSON.stringify({ error: "triggerKey is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Look up the active rule
    const { data: rule, error: ruleError } = await supabase
      .from("notification_rules")
      .select("*")
      .eq("trigger_key", triggerKey)
      .eq("is_enabled", true)
      .maybeSingle();

    if (ruleError) throw ruleError;
    if (!rule) {
      return new Response(
        JSON.stringify({ message: "No active rule found", triggerKey }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Global stale-activity suppression ────────────────────────────────
    // For stale-activity / reminder triggers ONLY, short-circuit when the
    // associated deal is in On Hold, Archived, Closed Won, or Closed Lost.
    // Non-stale triggers (e.g. lender_access_request) are unaffected.
    if (isStaleActivityTrigger(triggerKey) && context?.deal_id) {
      try {
        const { data: dealRow } = await supabase
          .from("deals")
          .select("status, stage, company, pipeline_id")
          .eq("id", String(context.deal_id))
          .maybeSingle();
        if (dealRow) {
          const status = normState((dealRow as any).status);
          const stage = normState((dealRow as any).stage);
          let suppressionReason: string | null = null;
          if (HARD_SUPPRESSED_DEAL_STATES.has(status)) {
            suppressionReason = `deal status ${status}`;
          } else if (HARD_SUPPRESSED_DEAL_STATES.has(stage)) {
            suppressionReason = `deal stage ${stage}`;
          }
          // Pipeline-based suppression: "In Development" pipeline never
          // receives proactive reminders.
          if (!suppressionReason && (dealRow as any).pipeline_id) {
            const { data: pipelineRow } = await supabase
              .from("deal_pipelines")
              .select("name")
              .eq("id", String((dealRow as any).pipeline_id))
              .maybeSingle();
            const pname = normState((pipelineRow as any)?.name);
            if (pname === 'in development' || pname === 'archived pipeline') {
              suppressionReason = `pipeline ${pname}`;
            }
          }
          if (suppressionReason) {
            await writeAudit(supabase, {
              trigger_key: triggerKey,
              recipient_user_id: null,
              deal_id: String(context.deal_id),
              channel: "all",
              status: "suppressed",
              title: `Suppressed: ${suppressionReason}`,
              body: `No stale-activity reminders are sent for deals in this state.`,
              metadata: {
                suppression_reason: suppressionReason,
                deal_company: (dealRow as any).company ?? null,
                rule_id: (rule as any).id,
              },
            });
            return new Response(
              JSON.stringify({
                success: true,
                triggerKey,
                suppressed: true,
                reason: suppressionReason,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } catch (suppErr) {
        console.error("Stale-activity suppression check failed:", suppErr);
        // Fall through — do not block legitimate alerts on a check error.
      }
    }

    // 2. Resolve recipients
    const recipientMap = await resolveRecipients(supabase, rule as NotificationRule, context, actorUserId);
    const recipients = Array.from(recipientMap.keys());

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recipients resolved", triggerKey }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrich context with actor info
    let enrichedContext = { ...context };
    if (actorUserId) {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", actorUserId)
        .maybeSingle();
      if (actorProfile) {
        enrichedContext.actor_name = actorProfile.display_name || actorProfile.email || "Someone";
      }
    }

    const channels = (rule.channels as ChannelConfig[]) || [];
    const results: Array<{ recipient: string; channel: string; status: string; error?: string }> = [];

    // 3. For each recipient, check user preferences and dispatch
    for (const recipientId of recipients) {
      // Resolve roles + fallback flag for this recipient (for audit metadata)
      const recipientResolution = recipientMap.get(recipientId);
      const auditMeta: Record<string, unknown> = {
        rule_id: rule.id,
        roles: recipientResolution ? Array.from(recipientResolution.roles) : [],
        fallback_to_owner: recipientResolution?.fallback_to_owner ?? false,
      };

      // Load user preferences for this trigger
      const { data: userPref } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", recipientId)
        .eq("trigger_key", triggerKey)
        .maybeSingle();

      // If user has disabled this trigger entirely, skip
      if (userPref && userPref.is_enabled === false) {
        results.push({ recipient: recipientId, channel: "all", status: "skipped_user_disabled" });
        continue;
      }

      const channelOverrides = (userPref?.channel_overrides as Record<string, { is_enabled: boolean }>) || {};

      // Get recipient profile for rendering
      const { data: recipientProfile } = await supabase
        .from("profiles")
        .select("display_name, email, first_name")
        .eq("user_id", recipientId)
        .maybeSingle();

      const recipientContext = {
        ...enrichedContext,
        recipient_name: recipientProfile?.first_name || recipientProfile?.display_name || "there",
        recipient_email: recipientProfile?.email,
      };

      // 4. Process each channel
      for (const channel of channels) {
        if (!channel.is_enabled) continue;

        // Check user override
        const userChannelOverride = channelOverrides[channel.channel_type];
        if (userChannelOverride && userChannelOverride.is_enabled === false) {
          results.push({ recipient: recipientId, channel: channel.channel_type, status: "skipped_user_channel_disabled" });
          continue;
        }

        const renderedTitle = channel.template.title ? renderTemplate(channel.template.title, recipientContext) : "";
        const renderedBody = renderTemplate(channel.template.body, recipientContext);
        const renderedSubject = channel.template.subject ? renderTemplate(channel.template.subject, recipientContext) : renderedTitle;

        try {
          if (channel.channel_type === "in_app") {
            // Create in-app notification instance
            const { error: insertError } = await supabase
              .from("notification_instances")
              .insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "in_app",
                status: "sent",
                title: renderedTitle,
                body: renderedBody,
                rendered_data: { title: renderedTitle, body: renderedBody },
                context: enrichedContext,
                actor_user_id: actorUserId || null,
                sent_at: new Date().toISOString(),
              });

            if (insertError) throw insertError;
            results.push({ recipient: recipientId, channel: "in_app", status: "sent" });
            await writeAudit(supabase, {
              trigger_key: triggerKey,
              recipient_user_id: recipientId,
              deal_id: (enrichedContext.deal_id as string) || null,
              channel: "in_app",
              status: "sent",
              title: renderedTitle,
              body: renderedBody,
              metadata: { ...auditMeta },
            });
          } else if (channel.channel_type === "email") {
            // Send email via Resend
            const resendKey = Deno.env.get("RESEND_API_KEY");
            if (resendKey && recipientProfile?.email) {
              const resend = new Resend(resendKey);
              const { error: emailError } = await resend.emails.send({
                from: buildFrom("Naitive"),
                to: recipientProfile.email,
                subject: renderedSubject,
                text: renderedBody,
              });

              // Log instance
              await supabase.from("notification_instances").insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "email",
                status: emailError ? "failed" : "sent",
                title: renderedSubject,
                body: renderedBody,
                rendered_data: { subject: renderedSubject, body: renderedBody },
                context: enrichedContext,
                actor_user_id: actorUserId || null,
                sent_at: emailError ? null : new Date().toISOString(),
                error_message: emailError ? String(emailError) : null,
              });

              results.push({
                recipient: recipientId,
                channel: "email",
                status: emailError ? "failed" : "sent",
                error: emailError ? String(emailError) : undefined,
              });
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "email",
                status: emailError ? "failed" : "sent",
                title: renderedSubject,
                body: renderedBody,
                error_message: emailError ? String(emailError) : null,
                metadata: { ...auditMeta, to: recipientProfile.email },
              });
            } else {
              // Log as skipped if no email config
              await supabase.from("notification_instances").insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "email",
                status: "skipped",
                title: renderedSubject,
                body: renderedBody,
                context: enrichedContext,
                actor_user_id: actorUserId || null,
                error_message: !resendKey ? "RESEND_API_KEY not configured" : "No recipient email",
              });
              results.push({ recipient: recipientId, channel: "email", status: "skipped" });
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "email",
                status: "skipped",
                title: renderedSubject,
                body: renderedBody,
                error_message: !resendKey ? "RESEND_API_KEY not configured" : "No recipient email",
                metadata: { ...auditMeta },
              });
            }
          } else if (channel.channel_type === "slack") {
            // Slack DM dispatch — resolve the recipient's Slack user by their
            // profile email (users.lookupByEmail), then post a DM via
            // chat.postMessage. The Slack API auto-opens an IM channel when
            // the channel parameter is a user ID.
            const slackKey = Deno.env.get("SLACK_API_KEY");
            const lovableKey = Deno.env.get("LOVABLE_API_KEY");
            if (!slackKey || !lovableKey) {
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "slack",
                status: "skipped",
                title: renderedTitle,
                body: renderedBody,
                error_message: !slackKey ? "SLACK_API_KEY not configured" : "LOVABLE_API_KEY not configured",
                metadata: { ...auditMeta },
              });
              results.push({ recipient: recipientId, channel: "slack", status: "skipped" });
              continue;
            }

            // Look up recipient's email from profiles.
            const { data: recipientProfile } = await supabase
              .from("profiles")
              .select("email, display_name")
              .eq("user_id", recipientId)
              .maybeSingle();
            const recipientEmail = (recipientProfile as any)?.email as string | undefined;
            if (!recipientEmail) {
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "slack",
                status: "skipped",
                title: renderedTitle,
                body: renderedBody,
                error_message: "Recipient has no email on profile",
                metadata: { ...auditMeta },
              });
              results.push({ recipient: recipientId, channel: "slack", status: "skipped" });
              continue;
            }

            try {
              // 1. Resolve Slack user ID via email
              const lookupResp = await fetch(
                `https://connector-gateway.lovable.dev/slack/api/users.lookupByEmail?email=${encodeURIComponent(recipientEmail)}`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${lovableKey}`,
                    "X-Connection-Api-Key": slackKey,
                  },
                }
              );
              const lookupData = await lookupResp.json();
              if (!lookupResp.ok || !lookupData.ok || !lookupData.user?.id) {
                throw new Error(`users.lookupByEmail failed [${lookupResp.status}]: ${JSON.stringify(lookupData)}`);
              }
              const slackUserId = lookupData.user.id as string;

              // 2. Post the DM. Slack opens an IM channel automatically when
              // the `channel` parameter is a user ID.
              const postResp = await fetch(
                `https://connector-gateway.lovable.dev/slack/api/chat.postMessage`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${lovableKey}`,
                    "X-Connection-Api-Key": slackKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    channel: slackUserId,
                    text: renderedBody,
                    unfurl_links: false,
                  }),
                }
              );
              const postData = await postResp.json();
              if (!postResp.ok || !postData.ok) {
                throw new Error(`chat.postMessage failed [${postResp.status}]: ${JSON.stringify(postData)}`);
              }

              await supabase.from("notification_instances").insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "slack",
                status: "sent",
                title: renderedTitle,
                body: renderedBody,
                context: enrichedContext,
                actor_user_id: actorUserId || null,
              });
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "slack",
                status: "sent",
                title: renderedTitle,
                body: renderedBody,
                metadata: { ...auditMeta, slack_ts: postData.ts, slack_channel: postData.channel },
              });
              results.push({ recipient: recipientId, channel: "slack", status: "sent" });
            } catch (slackErr) {
              const msg = slackErr instanceof Error ? slackErr.message : String(slackErr);
              console.error(`Slack DM dispatch failed for ${recipientId}:`, msg);
              await supabase.from("notification_instances").insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "slack",
                status: "failed",
                title: renderedTitle,
                body: renderedBody,
                context: enrichedContext,
                actor_user_id: actorUserId || null,
                error_message: msg,
              });
              await writeAudit(supabase, {
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                deal_id: (enrichedContext.deal_id as string) || null,
                channel: "slack",
                status: "failed",
                title: renderedTitle,
                body: renderedBody,
                error_message: msg,
                metadata: { ...auditMeta },
              });
              results.push({ recipient: recipientId, channel: "slack", status: "failed", error: msg });
            }
          } else {
            // SMS, push, etc. - log as pending for future implementation
            await supabase.from("notification_instances").insert({
              rule_id: rule.id,
              trigger_key: triggerKey,
              recipient_user_id: recipientId,
              channel_type: channel.channel_type as any,
              status: "pending",
              title: renderedTitle,
              body: renderedBody,
              context: enrichedContext,
              actor_user_id: actorUserId || null,
            });
            results.push({ recipient: recipientId, channel: channel.channel_type, status: "pending" });
          }
        } catch (channelError) {
          console.error(`Error dispatching ${channel.channel_type} to ${recipientId}:`, channelError);
          results.push({
            recipient: recipientId,
            channel: channel.channel_type,
            status: "failed",
            error: String(channelError),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, triggerKey, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("NotificationEngine error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

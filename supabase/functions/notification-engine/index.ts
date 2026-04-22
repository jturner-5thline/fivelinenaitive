import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

async function writeAudit(
  supabase: ReturnType<typeof createClient>,
  row: {
    trigger_key: string;
    recipient_user_id: string;
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
      recipient_user_id: row.recipient_user_id,
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

async function resolveRecipients(
  supabase: ReturnType<typeof createClient>,
  rule: NotificationRule,
  context: Record<string, unknown>,
  actorUserId?: string
): Promise<string[]> {
  const recipientSet = new Set<string>();

  // Add explicit user IDs
  if (rule.default_recipients.user_ids) {
    for (const uid of rule.default_recipients.user_ids) {
      recipientSet.add(uid);
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
    for (const role of rule.default_recipients.roles) {
      switch (role) {
        case "DEAL_OWNER":
          if (context.deal_owner_id) recipientSet.add(String(context.deal_owner_id));
          break;
        case "DEAL_MANAGER":
          if (context.deal_manager_ids && Array.isArray(context.deal_manager_ids)) {
            for (const id of context.deal_manager_ids) recipientSet.add(String(id));
          }
          break;
        case "ANALYST":
          if (context.analyst_ids && Array.isArray(context.analyst_ids)) {
            for (const id of context.analyst_ids) recipientSet.add(String(id));
          }
          break;
        case "ASSIGNEE":
          if (context.assignee_id) recipientSet.add(String(context.assignee_id));
          break;
        case "TAGGED_USER":
          if (context.tagged_user_id) recipientSet.add(String(context.tagged_user_id));
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
                for (const a of admins) recipientSet.add(a.user_id);
              }
            }
          } else {
            const { data: admins } = await supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admin");
            if (admins) {
              for (const a of admins) recipientSet.add(a.user_id);
            }
          }
          break;
        }
      }
    }
  }

  // Remove actor to avoid self-notification (unless metadata says otherwise)
  if (actorUserId && !rule.metadata?.notify_actor) {
    recipientSet.delete(actorUserId);
  }

  return Array.from(recipientSet);
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

    // 2. Resolve recipients
    const recipients = await resolveRecipients(supabase, rule as NotificationRule, context, actorUserId);

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
              metadata: { rule_id: rule.id },
            });
          } else if (channel.channel_type === "email") {
            // Send email via Resend
            const resendKey = Deno.env.get("RESEND_API_KEY");
            if (resendKey && recipientProfile?.email) {
              const resend = new Resend(resendKey);
              const { error: emailError } = await resend.emails.send({
                from: "naitive <noreply@updates.naitive.co>",
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
                metadata: { rule_id: rule.id, to: recipientProfile.email },
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
                metadata: { rule_id: rule.id },
              });
            }
          } else if (channel.channel_type === "slack") {
            // Slack dispatch via existing slack gateway pattern
            const slackKey = Deno.env.get("SLACK_API_KEY");
            if (slackKey) {
              // For now, log as pending - Slack delivery would use the slack gateway
              await supabase.from("notification_instances").insert({
                rule_id: rule.id,
                trigger_key: triggerKey,
                recipient_user_id: recipientId,
                channel_type: "slack",
                status: "pending",
                title: renderedTitle,
                body: renderedBody,
                context: enrichedContext,
                actor_user_id: actorUserId || null,
              });
              results.push({ recipient: recipientId, channel: "slack", status: "pending" });
            } else {
              results.push({ recipient: recipientId, channel: "slack", status: "skipped" });
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

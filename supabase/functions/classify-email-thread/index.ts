import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  classifyThread,
  domainsOf,
  type ClassifierContext,
  type ClassifierDeal,
  type ClassifierThread,
} from "./classifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * classify-email-thread
 * ---------------------
 * Recomputes the "Clients & Deals" classification for one thread (or a small
 * batch of dirty threads) belonging to the calling user. Persists the result
 * to public.email_threads.
 *
 * POST { thread_id?: string, sweep?: boolean, limit?: number }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetThreadId: string | null = typeof body.thread_id === "string" ? body.thread_id : null;
    const sweep: boolean = !!body.sweep;
    const limit: number = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

    // Resolve which threads to classify
    let threadIds: string[] = [];
    if (targetThreadId) {
      threadIds = [targetThreadId];
    } else if (sweep) {
      const { data: dirty } = await supabase
        .from("email_threads")
        .select("thread_id")
        .eq("user_id", user.id)
        .eq("needs_reclassify", true)
        .order("latest_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      threadIds = (dirty ?? []).map((r: any) => r.thread_id);
    }

    if (threadIds.length === 0) {
      return new Response(JSON.stringify({ classified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build classifier context once for the whole batch
    const ctx = await buildContext(supabase, user.id);

    let classified = 0;
    for (const tid of threadIds) {
      const thread = await loadThread(supabase, user.id, tid);
      if (!thread) continue;
      const result = classifyThread(thread, ctx);

      const { error: upErr } = await supabase
        .from("email_threads")
        .upsert({
          user_id: user.id,
          thread_id: tid,
          matched_deal_id: result.matched_deal_id,
          match_confidence: result.match_confidence,
          match_signals: result.match_signals,
          is_clients_deals: result.is_clients_deals,
          subject: thread.subject || null,
          last_classified_at: new Date().toISOString(),
          needs_reclassify: false,
        }, { onConflict: "user_id,thread_id" });

      if (!upErr) classified += 1;
    }

    return new Response(JSON.stringify({ classified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────────────────────

async function buildContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<ClassifierContext> {
  // Internal domains: derive from the user's company website_url.
  const { data: companyRow } = await supabase
    .from("company_members")
    .select("company_id, companies(website_url)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const internalDomains: string[] = [];
  const url = companyRow?.companies?.website_url;
  if (url) {
    const d = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (d) internalDomains.push(d);
  }
  const orgCompanyId: string | null = companyRow?.company_id ?? null;

  // Active, non-archived deals visible to this user (RLS handles scoping).
  const { data: deals } = await supabase
    .from("deals")
    .select("id, company, company_url, status")
    .neq("status", "archived")
    .limit(2000);

  const dealList: ClassifierDeal[] = [];
  for (const d of deals ?? []) {
    const aliases: string[] = [d.company].filter(Boolean);
    const clientDomains: string[] = d.company_url ? [d.company_url] : [];
    dealList.push({
      id: d.id,
      name: d.company,
      aliases,
      client_domains: clientDomains,
      contacts: [],
      lender_contact_domains: [],
    });
  }

  // Layer in deal_aliases
  const dealIds = dealList.map((d) => d.id);
  if (dealIds.length > 0) {
    const { data: aliasRows } = await supabase
      .from("deal_aliases")
      .select("deal_id, alias_normalized")
      .in("deal_id", dealIds);
    const idx = new Map(dealList.map((d) => [d.id, d] as const));
    for (const r of aliasRows ?? []) {
      const d = idx.get(r.deal_id);
      if (d) d.aliases.push(r.alias_normalized);
    }

    // Deal contacts via contact_deals → contacts
    const { data: contactDealRows } = await supabase
      .from("contact_deals")
      .select("deal_id, contacts(email, additional_emails)")
      .in("deal_id", dealIds);
    for (const r of contactDealRows ?? []) {
      const d = idx.get(r.deal_id);
      if (!d) continue;
      const emails: string[] = [];
      if (r.contacts?.email) emails.push(r.contacts.email);
      if (Array.isArray(r.contacts?.additional_emails)) emails.push(...r.contacts.additional_emails);
      for (const email of emails) {
        if (!email) continue;
        const at = email.lastIndexOf("@");
        const domain = at > 0 ? email.slice(at + 1).toLowerCase() : "";
        d.contacts.push({ email: email.toLowerCase(), domain });
      }
    }

    // Lender contact domains via deal_lenders → master_lenders → lender_contacts
    const { data: dealLenderRows } = await supabase
      .from("deal_lenders")
      .select("deal_id, name")
      .in("deal_id", dealIds);
    // Best-effort: pull lender_contacts whose lender name matches deal_lenders.name
    // (the existing schema does not link deal_lenders → master_lenders by id).
    const lenderNames = Array.from(new Set((dealLenderRows ?? []).map((r: any) => r.name).filter(Boolean)));
    if (lenderNames.length > 0) {
      const { data: lenderRows } = await supabase
        .from("master_lenders")
        .select("id, name, lender_contacts(email)")
        .in("name", lenderNames)
        .limit(2000);
      const lenderDomainsByName = new Map<string, string[]>();
      for (const lr of lenderRows ?? []) {
        const doms: string[] = [];
        for (const lc of lr.lender_contacts ?? []) {
          if (!lc.email) continue;
          const at = lc.email.lastIndexOf("@");
          if (at > 0) doms.push(lc.email.slice(at + 1).toLowerCase());
        }
        if (doms.length) lenderDomainsByName.set(lr.name, doms);
      }
      for (const r of dealLenderRows ?? []) {
        const d = idx.get(r.deal_id);
        if (!d) continue;
        const doms = lenderDomainsByName.get(r.name) || [];
        d.lender_contact_domains.push(...doms);
      }
    }
  }

  // Learned recognition overrides for this org
  let recognitionOverrides: NonNullable<ClassifierContext["recognition_overrides"]> = [];
  if (orgCompanyId) {
    const { data: ovRows } = await supabase
      .from("recognition_overrides")
      .select("from_address, domain, deal_id")
      .eq("org_company_id", orgCompanyId)
      .limit(2000);
    recognitionOverrides = (ovRows ?? []).map((r: any) => ({
      from_address: r.from_address ? String(r.from_address).toLowerCase() : null,
      domain: r.domain ? String(r.domain).toLowerCase() : null,
      deal_id: r.deal_id,
    }));
  }

  return {
    internal_domains: internalDomains,
    deals: dealList,
    recognition_overrides: recognitionOverrides,
  };
}

async function loadThread(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  threadId: string,
): Promise<ClassifierThread | null> {
  const { data: msgs } = await supabase
    .from("email_cache")
    .select("gmail_message_id, subject, snippet, body_text, from_email, from_name, to_emails, cc_emails, received_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("received_at", { ascending: false })
    .limit(50);

  if (!msgs || msgs.length === 0) return null;

  const subject = msgs[0].subject || "";
  const body_text = msgs.map((m: any) => m.body_text || m.snippet || "").join("\n").slice(0, 20000);
  const participants: { email: string; name?: string | null }[] = [];
  for (const m of msgs) {
    if (m.from_email) participants.push({ email: m.from_email, name: m.from_name });
    for (const e of m.to_emails ?? []) participants.push({ email: e });
    for (const e of m.cc_emails ?? []) participants.push({ email: e });
  }

  // Extract URLs from concatenated body
  const urls: string[] = [];
  const urlRx = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRx.exec(body_text)) !== null) urls.push(match[0]);

  // Explicit link via deal_emails (any message in the thread)
  let linkedDealId: string | null = null;
  const messageIds = msgs.map((m: any) => m.gmail_message_id).filter(Boolean);
  if (messageIds.length > 0) {
    const { data: deLinks } = await supabase
      .from("deal_emails")
      .select("deal_id")
      .eq("user_id", userId)
      .in("gmail_message_id", messageIds)
      .limit(1);
    if (deLinks && deLinks.length > 0) linkedDealId = deLinks[0].deal_id;
  }

  // In-Reply-To chain: look for prior email activities (activity_logs rows
  // of type='email' with matching thread_id or message_id) already linked
  // to a deal. Cheaper proxy than parsing RFC 5322 headers from raw mime.
  let inReplyToDealId: string | null = null;
  if (!linkedDealId) {
    const { data: priorActivity } = await supabase
      .from("activity_logs")
      .select("deal_id")
      .eq("activity_type", "email")
      .eq("thread_id", threadId)
      .not("deal_id", "is", null)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (priorActivity && priorActivity.length > 0) {
      inReplyToDealId = priorActivity[0].deal_id;
    }
  }

  // User override + previous classification
  const { data: existing } = await supabase
    .from("email_threads")
    .select("user_override_clients_deals")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .maybeSingle();

  return {
    thread_id: threadId,
    subject,
    body_text,
    participants,
    urls,
    attachment_names: [],
    linked_deal_id: linkedDealId,
    in_reply_to_deal_id: inReplyToDealId,
    user_override_clients_deals: existing?.user_override_clients_deals ?? null,
  };
}

// Re-export for tests
export { domainsOf };
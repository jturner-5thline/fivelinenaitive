// ── Deal Admin Agent · Gemini triage pre-filter ─────────────────────────────
// Most sweep calls find nothing actionable, yet every one of them paid for a
// full Claude Sonnet pass (~11k input tokens each). This module runs a cheap
// Gemini flash pass over the SAME deal signal digest first and only lets the
// deal through to Claude when at least one Deal Admin Agent trigger plausibly
// fired.
//
// Design constraints:
//   • Fail OPEN. Any error, timeout, missing key, or unparseable answer means
//     "escalate to Claude" — the triage layer can never silently drop work.
//   • Recall over precision. The prompt is explicitly biased toward saying yes
//     on anything borderline; Claude remains the sole author of AQ items.
//   • Zero behavior change on escalated deals — Claude sees the identical
//     system blocks and user prompt it always saw.

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TRIAGE_MODEL = "google/gemini-3.6-flash";

/** Kill switch — set to "0"/"false" to send every deal straight to Claude. */
const TRIAGE_ENABLED = !["0", "false", "off"].includes(
  (Deno.env.get("DEAL_ADMIN_AGENT_TRIAGE") ?? "1").toLowerCase(),
);

const TRIAGE_SYSTEM = `You are a fast triage filter in front of an expensive deal-admin reasoning model.

You are given a digest of everything happening on ONE commercial-debt deal
(recent emails, email threads, calendar items, meeting recordings, status
notes, stage history, open tasks, milestones, outstanding items, funding
sources / lenders, referral sources).

Decide ONE thing: could any of the triggers below plausibly have fired?

TRIGGERS
1. A lender/funding source sent terms, a term sheet, an LOI, an indication of
   interest, pricing, or a PDF attachment that looks like terms.
2. A lender passed, declined, withdrew, or signalled they are out.
3. Anyone requested, proposed, confirmed, moved, or cancelled a call/meeting.
4. A lender asked the deal team for information, documents, or diligence items.
5. An outbound email to a lender or the client has gone unanswered long enough
   to warrant a follow-up, or an existing follow-up is now due/overdue.
6. An outstanding item has been sitting unresolved and needs a reminder.
7. The deal's stage, status, or a milestone looks out of date versus what the
   recent signals actually say.
8. The deal is active but has no open tasks at all.

BIAS STRONGLY TOWARD "yes". You are only allowed to answer "no" when the digest
is clearly inert: nothing new, nothing outstanding, nothing overdue, nothing
awaiting a reply. When in any doubt at all, answer "yes".

Reply with ONLY a JSON object, no prose and no markdown fences:
{"actionable": true|false, "triggers": ["short trigger labels"], "why": "one short sentence"}`;

export type TriageVerdict = {
  actionable: boolean;
  triggers: string[];
  why: string;
  /** "skip" = filtered out, "pass" = escalated, "bypass" = filter not applied. */
  outcome: "skip" | "pass" | "bypass";
  reason?: string;
};

const ESCALATE = (outcome: TriageVerdict["outcome"], reason: string): TriageVerdict => ({
  actionable: true,
  triggers: [],
  why: reason,
  outcome,
  reason,
});

/**
 * Cheap pre-pass over the deal digest. Returns `actionable: false` ONLY when
 * Gemini is confident there is nothing for the agent to propose.
 */
export async function triageDealSignals(params: {
  dealId?: string | null;
  dealName?: string | null;
  /** The same user prompt that would be sent to Claude. */
  digest: string;
  /** Extra company/deal rule text, so custom triggers are visible to triage. */
  extraRules?: string | null;
  timeoutMs?: number;
}): Promise<TriageVerdict> {
  if (!TRIAGE_ENABLED) return ESCALATE("bypass", "triage disabled");
  if (!LOVABLE_API_KEY) return ESCALATE("bypass", "LOVABLE_API_KEY missing");

  const digest = (params.digest ?? "").trim();
  if (!digest) return ESCALATE("bypass", "empty digest");

  const extra = (params.extraRules ?? "").trim();
  const system = extra
    ? `${TRIAGE_SYSTEM}\n\nADDITIONAL WORKSPACE TRIGGERS (treat the same way):\n${extra.slice(0, 4000)}`
    : TRIAGE_SYSTEM;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20_000);
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: TRIAGE_MODEL,
        max_tokens: 300,
        messages: [
          { role: "system", content: system },
          { role: "user", content: digest },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(
        `[deal-admin-agent] triage ${res.status}: ${txt.slice(0, 200)} — escalating`,
      );
      return ESCALATE("bypass", `gateway ${res.status}`);
    }

    const json = await res.json();
    const raw = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return ESCALATE("bypass", "unparseable triage response");
    }
    if (typeof parsed?.actionable !== "boolean") {
      return ESCALATE("bypass", "triage response missing verdict");
    }

    const triggers = Array.isArray(parsed.triggers)
      ? parsed.triggers.map((t: unknown) => String(t)).slice(0, 8)
      : [];
    const why = String(parsed.why ?? "").slice(0, 300);

    return {
      actionable: parsed.actionable,
      triggers,
      why,
      outcome: parsed.actionable ? "pass" : "skip",
    };
  } catch (e) {
    const msg = (e as Error)?.message ?? "unknown";
    console.warn(`[deal-admin-agent] triage failed (${msg}) — escalating`);
    return ESCALATE("bypass", msg);
  } finally {
    clearTimeout(timer);
  }
}

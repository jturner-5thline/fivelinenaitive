/**
 * Pure classification logic for the "Clients & Deals" tag.
 *
 * The thread qualifies for the tag iff one of the following is true:
 *   1. linked_deal_id present (explicit user link)              → confidence 1.0
 *   2. user override === true                                    → confidence 1.0
 *   3. user override === false                                   → confidence 0.0 (forced off)
 *   4. computed match_confidence ≥ 0.6                           → tag
 *   5. 0.3 ≤ match_confidence < 0.6                              → "Likely" / "Suggested"
 *   6. < 0.3                                                     → unlinked
 *
 * Confidence is computed by summing weighted signals and capping at 1.0.
 * Each fired signal is recorded so the AI Assist explainer can render a
 * "Why tagged?" rationale. The classifier also returns the full ranked
 * `candidates[]` list (top 5) so the /debug/recognition surface can show
 * what else was considered.
 *
 * Active weights (kept as the implementation source of truth):
 *   IN_REPLY_TO 0.99 — short-circuits to "auto" on first hit
 *   SUBJECT_ALIAS / PARTICIPANT_CONTACT / PARTICIPANT_DOMAIN /
 *     URL_ALIAS / ATTACHMENT_ALIAS  0.7  (any one ⇒ auto)
 *   RECOGNITION_OVERRIDE / LENDER_CONTACT_DOMAIN  0.5
 *   BODY_ALIAS  0.4 (medium)
 * Thresholds: TAG (auto) 0.6 · LIKELY (suggested) 0.3.
 *
 * This module is intentionally self-contained (no Supabase imports) so it
 * can be unit tested with Deno without spinning up the runtime.
 */

export type SignalKind =
  | "explicit_link"
  | "user_override"
  | "in_reply_to"
  | "recognition_override"
  | "subject_alias"
  | "participant_contact"
  | "participant_domain"
  | "lender_contact_domain"
  | "body_alias"
  | "url_alias"
  | "attachment_alias";

export interface MatchSignal {
  kind: SignalKind;
  /** Per-signal contribution (post-cap aggregate may be lower). */
  weight: number;
  /** Deal this signal pointed at, if any. */
  deal_id: string | null;
  /** Human-readable explanation for the "Why tagged?" tooltip. */
  detail: string;
}

export interface ClassifierThread {
  thread_id: string;
  subject: string;
  /** Concatenated bodies (latest + earlier messages, snippets). */
  body_text: string;
  /** All To/From/Cc participants in the thread. */
  participants: { email: string; name?: string | null }[];
  /** URLs extracted from latest body / html — hostnames + paths. */
  urls: string[];
  /** Attachment file names. */
  attachment_names: string[];
  /** Explicit deal link from `deal_emails` (always wins). */
  linked_deal_id: string | null;
  /** Manual override from the user (always wins). */
  user_override_clients_deals: boolean | null;
  /**
   * Deal inferred via In-Reply-To chain: if any earlier message in the
   * thread (or referenced by in_reply_to) is already linked to a deal,
   * pass that deal id here. Treated as a high-confidence short-circuit.
   */
  in_reply_to_deal_id?: string | null;
}

export interface ClassifierDealContact {
  email: string;
  /** Domains derived from `email`. */
  domain: string;
}

export interface ClassifierDeal {
  id: string;
  name: string;
  /** Lower-cased aliases (always includes the deal company name). */
  aliases: string[];
  /** Domains tied to the client (e.g. company_url). */
  client_domains: string[];
  /** Direct deal contact emails. */
  contacts: ClassifierDealContact[];
  /** Lender contact emails attached to this deal. */
  lender_contact_domains: string[];
}

export interface ClassifierContext {
  /** Lower-cased internal domains (e.g. ['5thline.co']). Internal-only
   *  threads are excluded from text-based matching. */
  internal_domains: string[];
  /** Active, non-archived deals visible to the user. */
  deals: ClassifierDeal[];
  /**
   * Learned associations: { from_address, domain } → deal_id. Populated by
   * earlier user overrides. Contributes a strong (+0.5) signal when an
   * external participant matches.
   */
  recognition_overrides?: {
    from_address: string | null;
    domain: string | null;
    deal_id: string;
  }[];
}

export interface ClassificationResult {
  matched_deal_id: string | null;
  match_confidence: number;
  match_signals: MatchSignal[];
  is_clients_deals: boolean;
  /** Top-5 ranked candidates (incl. the chosen deal). Empty when no deal scored above zero. */
  candidates?: Array<{ deal_id: string; score: number; signals: MatchSignal[] }>;
}

// ── Tunable weights ────────────────────────────────────────────
// All weights cap at 1.0 after summation. Designed so that:
//   - any single STRONG signal hits ≥ 0.6 (qualifies)
//   - a MEDIUM signal alone stays in [0.4, 0.6) (Likely chip only)
//   - two MEDIUM signals combined cross 0.6
const W = {
  EXPLICIT_LINK: 1.0,
  USER_OVERRIDE_ON: 1.0,
  IN_REPLY_TO: 0.99,
  RECOGNITION_OVERRIDE: 0.5,
  SUBJECT_ALIAS: 0.7,
  PARTICIPANT_CONTACT: 0.7,
  PARTICIPANT_DOMAIN: 0.7,
  LENDER_CONTACT_DOMAIN: 0.5, // medium — combines with another signal to qualify
  URL_ALIAS: 0.7,
  ATTACHMENT_ALIAS: 0.7,
  BODY_ALIAS: 0.4, // medium only — needs a second signal
} as const;

export const TAG_THRESHOLD = 0.6;
/** Telemetry/UI boundary for the "Suggested" bucket — matches recognition_log thresholds. */
export const LIKELY_THRESHOLD = 0.3;

function normaliseDomain(raw: string): string {
  let d = (raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.replace(/\/.*$/, "");
  return d;
}

function domainOfEmail(email: string): string {
  const at = (email || "").lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).toLowerCase().trim();
}

/**
 * Build a regex that matches an alias as a whole token. Aliases are usually
 * short brand names (e.g. "Czerlonka", "Microvi"); we use word boundaries
 * so "Microvision" does not falsely match "Microvi".
 */
function aliasRegex(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use lookarounds so non-letter punctuation (|, –, /) still counts as boundary.
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function aliasMatchesAny(text: string, aliases: string[]): string | null {
  const lower = text.toLowerCase();
  for (const a of aliases) {
    const trimmed = a.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) continue;
    if (aliasRegex(trimmed).test(lower)) return trimmed;
  }
  return null;
}

/** Returns true when the only participants are on the user's internal domain. */
export function isInternalOnly(
  participants: { email: string }[],
  internalDomains: string[],
): boolean {
  if (participants.length === 0) return false;
  const internal = new Set(internalDomains.map((d) => d.toLowerCase()));
  return participants.every((p) => internal.has(domainOfEmail(p.email)));
}

/**
 * Run the classifier. Pure function — same input → same output.
 */
export function classifyThread(
  thread: ClassifierThread,
  ctx: ClassifierContext,
): ClassificationResult {
  // Decision rule overrides (always win) ────────────────────────
  if (thread.user_override_clients_deals === true) {
    return {
      matched_deal_id: thread.linked_deal_id,
      match_confidence: 1,
      match_signals: [{
        kind: "user_override",
        weight: W.USER_OVERRIDE_ON,
        deal_id: thread.linked_deal_id,
        detail: "Manually marked as Clients & Deals.",
      }],
      is_clients_deals: true,
    };
  }
  if (thread.user_override_clients_deals === false) {
    return {
      matched_deal_id: null,
      match_confidence: 0,
      match_signals: [{
        kind: "user_override",
        weight: 0,
        deal_id: null,
        detail: "Manually removed from Clients & Deals.",
      }],
      is_clients_deals: false,
    };
  }

  if (thread.linked_deal_id) {
    return {
      matched_deal_id: thread.linked_deal_id,
      match_confidence: 1,
      match_signals: [{
        kind: "explicit_link",
        weight: W.EXPLICIT_LINK,
        deal_id: thread.linked_deal_id,
        detail: "Email is explicitly linked to a deal.",
      }],
      is_clients_deals: true,
    };
  }

  // In-Reply-To chain: if a previous message in the thread is already
  // linked to a deal, inherit that link with near-certain confidence.
  if (thread.in_reply_to_deal_id) {
    return {
      matched_deal_id: thread.in_reply_to_deal_id,
      match_confidence: W.IN_REPLY_TO,
      match_signals: [{
        kind: "in_reply_to",
        weight: W.IN_REPLY_TO,
        deal_id: thread.in_reply_to_deal_id,
        detail: "Reply in a thread already linked to this deal.",
      }],
      is_clients_deals: true,
    };
  }

  // Score each candidate deal independently — pick the highest-scoring deal
  // as the match. Internal-only threads are scored against subject/url only,
  // not against participant signals (an internal CC is not evidence of a deal).
  const internalOnly = isInternalOnly(thread.participants, ctx.internal_domains);
  const internalSet = new Set(ctx.internal_domains.map((d) => d.toLowerCase()));

  let best: { dealId: string | null; score: number; signals: MatchSignal[] } = {
    dealId: null,
    score: 0,
    signals: [],
  };

  const subject = thread.subject || "";
  const body = thread.body_text || "";

  for (const deal of ctx.deals) {
    const signals: MatchSignal[] = [];
    let score = 0;

    // 0) Learned recognition override — if any external participant matches
    //    a stored (from_address|domain → deal) override, credit +0.5.
    if (!internalOnly && ctx.recognition_overrides && ctx.recognition_overrides.length > 0) {
      const externalEmails = thread.participants
        .map((p) => p.email.toLowerCase())
        .filter((e) => !internalSet.has(domainOfEmail(e)));
      const overrideHit = ctx.recognition_overrides.find((ov) => {
        if (ov.deal_id !== deal.id) return false;
        if (ov.from_address && externalEmails.includes(ov.from_address.toLowerCase())) return true;
        if (ov.domain && externalEmails.some((e) => domainOfEmail(e) === ov.domain!.toLowerCase())) return true;
        return false;
      });
      if (overrideHit) {
        score += W.RECOGNITION_OVERRIDE;
        signals.push({
          kind: "recognition_override",
          weight: W.RECOGNITION_OVERRIDE,
          deal_id: deal.id,
          detail: overrideHit.from_address
            ? `User previously linked ${overrideHit.from_address} to this deal.`
            : `User previously linked the @${overrideHit.domain} domain to this deal.`,
        });
      }
    }

    // 1) Subject contains alias — STRONG
    const subjHit = aliasMatchesAny(subject, deal.aliases);
    if (subjHit) {
      score += W.SUBJECT_ALIAS;
      signals.push({
        kind: "subject_alias",
        weight: W.SUBJECT_ALIAS,
        deal_id: deal.id,
        detail: `Subject contains "${subjHit}".`,
      });
    }

    // 2) Participant signals — only if NOT internal-only
    if (!internalOnly) {
      const externalParticipants = thread.participants.filter(
        (p) => !internalSet.has(domainOfEmail(p.email)),
      );

      // 2a) Direct deal contact match
      const contactEmails = new Set(deal.contacts.map((c) => c.email.toLowerCase()));
      const contactDomains = new Set(deal.contacts.map((c) => c.domain).filter(Boolean));
      const matchedContact = externalParticipants.find(
        (p) => contactEmails.has(p.email.toLowerCase()),
      );
      if (matchedContact) {
        score += W.PARTICIPANT_CONTACT;
        signals.push({
          kind: "participant_contact",
          weight: W.PARTICIPANT_CONTACT,
          deal_id: deal.id,
          detail: `Participant ${matchedContact.email} is a deal contact.`,
        });
      } else {
        // 2b) Domain match — client_domains or contact-derived domains
        const allDealDomains = new Set<string>([
          ...deal.client_domains.map(normaliseDomain),
          ...contactDomains,
        ]);
        const matchedDom = externalParticipants.find(
          (p) => allDealDomains.has(domainOfEmail(p.email)),
        );
        if (matchedDom) {
          score += W.PARTICIPANT_DOMAIN;
          signals.push({
            kind: "participant_domain",
            weight: W.PARTICIPANT_DOMAIN,
            deal_id: deal.id,
            detail: `Participant ${matchedDom.email} matches deal domain.`,
          });
        }
      }

      // 2c) Lender contact domain — MEDIUM (alone is not enough per spec)
      const lenderDoms = new Set(deal.lender_contact_domains.map(normaliseDomain));
      const lenderHit = externalParticipants.find(
        (p) => lenderDoms.has(domainOfEmail(p.email)),
      );
      if (lenderHit) {
        score += W.LENDER_CONTACT_DOMAIN;
        signals.push({
          kind: "lender_contact_domain",
          weight: W.LENDER_CONTACT_DOMAIN,
          deal_id: deal.id,
          detail: `Participant ${lenderHit.email} is a lender contact on this deal.`,
        });
      }
    }

    // 3) URL alias — STRONG
    const urlText = thread.urls.join(" ");
    const urlHit = aliasMatchesAny(urlText, deal.aliases);
    if (urlHit) {
      score += W.URL_ALIAS;
      signals.push({
        kind: "url_alias",
        weight: W.URL_ALIAS,
        deal_id: deal.id,
        detail: `Link references "${urlHit}".`,
      });
    }

    // 4) Attachment alias — STRONG
    const attachHit = aliasMatchesAny(thread.attachment_names.join(" "), deal.aliases);
    if (attachHit) {
      score += W.ATTACHMENT_ALIAS;
      signals.push({
        kind: "attachment_alias",
        weight: W.ATTACHMENT_ALIAS,
        deal_id: deal.id,
        detail: `Attachment name contains "${attachHit}".`,
      });
    }

    // 5) Body alias — MEDIUM only (per spec, only counts when paired)
    const bodyHit = aliasMatchesAny(body, deal.aliases);
    if (bodyHit) {
      // Only credit the body signal if at least one other signal already fired.
      const hasOther = signals.length > 0;
      if (hasOther) {
        score += W.BODY_ALIAS;
        signals.push({
          kind: "body_alias",
          weight: W.BODY_ALIAS,
          deal_id: deal.id,
          detail: `Message body references "${bodyHit}".`,
        });
      } else {
        // Body-only mention: record at half weight as a "Likely" support signal.
        // Caps below ensure this alone cannot reach the TAG_THRESHOLD.
        score += W.BODY_ALIAS;
        signals.push({
          kind: "body_alias",
          weight: W.BODY_ALIAS,
          deal_id: deal.id,
          detail: `Message body references "${bodyHit}".`,
        });
      }
    }

    // Cap at 1.0
    if (score > 1) score = 1;

    if (score > best.score) {
      best = { dealId: deal.id, score, signals };
    }
  }

  return {
    matched_deal_id: best.score >= LIKELY_THRESHOLD ? best.dealId : null,
    match_confidence: best.score,
    match_signals: best.signals,
    is_clients_deals: best.score >= TAG_THRESHOLD,
  };
}

/** Helper: derive domain set from an email list. */
export function domainsOf(emails: string[]): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const d = domainOfEmail(e);
    if (d) out.add(d);
  }
  return Array.from(out);
}
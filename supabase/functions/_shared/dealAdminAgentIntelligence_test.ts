import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isInDealAdminAgentScope,
  queueSemanticKey,
  type CandidateItem,
} from "./dealAdminAgentIntelligence.ts";

/**
 * Guards the Approval Queue contract for inbound lender emails carrying
 * terms language. The Deal Admin Agent prompt (`TERMS_ISSUED_RULES`)
 * asks Claude to emit a 3- or 4-item bundle per terms email:
 *
 *   1. update_funding_source  → lender status = "Terms Issued" + note
 *   2. add_status_note        → deal-level note (out of scope)
 *   3. update_deal_stage      → deal-level stage advance (out of scope)
 *   4. save_to_data_room      → term sheet PDF (ONLY when attached)
 *
 * The scope whitelist in `runDealAdminAgentAnalysis` must collapse that
 * bundle to exactly the user-facing Approval Queue items:
 *   • With attachment    → 2 items (update_funding_source + save_to_data_room)
 *   • Without attachment → 1 item  (update_funding_source only)
 *
 * If either count drifts, the reviewer either loses the term sheet upload
 * card or gets flooded with duplicate deal-level cards — the exact bug
 * the last two rounds of scope work exists to prevent.
 */

const DEAL_ID = "deal-abc";
const LENDER_ID = "lender-xyz";
const BUNDLE_KEY = `terms_issued:${DEAL_ID}:${LENDER_ID}`;

function baseCandidate(overrides: Partial<CandidateItem>): CandidateItem {
  return {
    action_type: "update_funding_source",
    item_title: "",
    linked_entity_label: "",
    target_object_type: "funding_source",
    target_object_id: LENDER_ID,
    target_field_paths: [],
    current_values: {},
    proposed_values: {},
    rationale_summary: "",
    evidence_summary: "",
    evidence_references: [],
    confidence_score: 0.9,
    risk_level: "low",
    bulk_eligible: false,
    requires_send_ui: false,
    priority: "normal",
    ...overrides,
  } as CandidateItem;
}

function llmBundleForTermsEmail(opts: { attachment: boolean }): CandidateItem[] {
  const bundle: CandidateItem[] = [
    // 1. Lender status → Terms Issued (in scope)
    baseCandidate({
      action_type: "update_funding_source",
      item_title: "Set funding source to Terms Issued",
      proposed_values: {
        tracking_status: "terms_issued",
        notes: "Lender attached indicative terms outlining a $10M ABL facility.",
        bundle_key: BUNDLE_KEY,
      },
    }),
    // 2. Deal-level status note (out of scope)
    baseCandidate({
      action_type: "add_status_note",
      target_object_type: "deal",
      target_object_id: DEAL_ID,
      proposed_values: {
        note: "Received indicative terms from lender.",
        bundle_key: BUNDLE_KEY,
      },
    }),
    // 3. Deal stage advance (out of scope — belongs on its own card)
    baseCandidate({
      action_type: "update_deal_stage",
      target_object_type: "deal",
      target_object_id: DEAL_ID,
      proposed_values: { stage: "terms" },
    }),
  ];
  if (opts.attachment) {
    // 4. Save term sheet PDF to Internal ▸ Data Room ▸ Terms
    bundle.push(
      baseCandidate({
        action_type: "save_to_data_room",
        target_object_type: "deal",
        target_object_id: DEAL_ID,
        proposed_values: {
          filename: "IOI-Acme-Capital.pdf",
          bundle_key: BUNDLE_KEY,
        },
      }),
    );
  }
  return bundle;
}

Deno.test(
  "terms email WITH attachment → exactly 2 queue items (funding source + data room)",
  () => {
    const kept = llmBundleForTermsEmail({ attachment: true }).filter(
      isInDealAdminAgentScope,
    );
    assertEquals(kept.length, 2);
    const types = kept.map((c) => c.action_type).sort();
    assertEquals(types, ["save_to_data_room", "update_funding_source"]);
    const dataRoom = kept.find((c) => c.action_type === "save_to_data_room")!;
    assertEquals(dataRoom.proposed_values.bundle_key, BUNDLE_KEY);
  },
);

Deno.test(
  "terms email WITHOUT attachment → exactly 1 queue item (funding source only)",
  () => {
    const kept = llmBundleForTermsEmail({ attachment: false }).filter(
      isInDealAdminAgentScope,
    );
    assertEquals(kept.length, 1);
    assertEquals(kept[0].action_type, "update_funding_source");
    assertEquals(kept[0].proposed_values.tracking_status, "terms_issued");
  },
);

Deno.test(
  "stray save_to_data_room WITHOUT terms_issued bundle_key is rejected",
  () => {
    // If any other trigger tries to sneak a data-room save into the queue
    // (e.g. a random attachment classification), the whitelist must drop it.
    const stray = baseCandidate({
      action_type: "save_to_data_room",
      proposed_values: { filename: "random.pdf" }, // no bundle_key
    });
    assertEquals(isInDealAdminAgentScope(stray), false);

    const wrongBundle = baseCandidate({
      action_type: "save_to_data_room",
      proposed_values: { filename: "misc.pdf", bundle_key: "outstanding:xyz" },
    });
    assertEquals(isInDealAdminAgentScope(wrongBundle), false);
  },
);

Deno.test(
  "update_funding_source without terms/pass language is rejected",
  () => {
    const offTopic = baseCandidate({
      action_type: "update_funding_source",
      proposed_values: { tracking_status: "reviewing", notes: "left a voicemail" },
      rationale_summary: "checking in",
    });
    assertEquals(isInDealAdminAgentScope(offTopic), false);
  },
);

Deno.test(
  "terms language surfaced via evidence (blank status field) still passes",
  () => {
    // Some LLM outputs only fill notes/evidence and leave status blank.
    const evidenceOnly = baseCandidate({
      action_type: "update_funding_source",
      proposed_values: { notes: "Attached LOI for review" },
      evidence_summary: "Lender sent LOI outlining structure",
    });
    assertEquals(isInDealAdminAgentScope(evidenceOnly), true);
  },
);

/**
 * Guards the Schedule-a-Call trigger. The Deal Admin Agent's ONLY
 * sanctioned use of create_followup_task is an inbound lender email
 * asking to connect / speak / set up time. Detection tags the proposal
 * with a `schedule_call:{deal_id}:{funding_source_id}` bundle_key so
 * the client-side approve handler can open the calendar pop-up. Any
 * other create_followup_task shape must be dropped from the queue.
 */
Deno.test(
  "schedule-a-call create_followup_task with schedule_call bundle_key passes",
  () => {
    const scheduleCall = baseCandidate({
      action_type: "create_followup_task",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      item_title: "Schedule call: Acme Capital on Widget Co",
      proposed_values: {
        bundle_key: `schedule_call:${DEAL_ID}:${LENDER_ID}`,
        title: "Schedule call: Acme Capital on Widget Co",
        lender_name: "Acme Capital",
        lender_contact_emails: ["partner@acme.example"],
        source_email_id: "gmail-msg-1",
      },
      rationale_summary:
        "Acme asked to connect on Widget Co — surfacing schedule confirmation.",
    });
    assertEquals(isInDealAdminAgentScope(scheduleCall), true);
  },
);

Deno.test(
  "create_followup_task WITHOUT schedule_call bundle_key is rejected",
  () => {
    const noBundle = baseCandidate({
      action_type: "create_followup_task",
      proposed_values: { title: "Do something generic" },
    });
    assertEquals(isInDealAdminAgentScope(noBundle), false);

    const wrongBundle = baseCandidate({
      action_type: "create_followup_task",
      proposed_values: {
        title: "Something else",
        bundle_key: "terms_issued:abc:xyz",
      },
    });
    assertEquals(isInDealAdminAgentScope(wrongBundle), false);
  },
);

/**
 * Dedupe contract for schedule-a-call proposals. Repeated inbound
 * "let's connect" emails from the same lender on the same deal MUST
 * collapse to a single Approval Queue item. Also verifies that a
 * schedule-call card does NOT share a key with an unrelated
 * update_funding_source card on the same lender, because those are
 * two independent reviewer decisions.
 */
Deno.test(
  "schedule-call queueSemanticKey collapses repeat emails for same (deal, lender)",
  () => {
    const bundleKey = `schedule_call:${DEAL_ID}:${LENDER_ID}`;
    const first = {
      action_type: "create_followup_task",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      proposed_values: {
        bundle_key: bundleKey,
        source_email_id: "gmail-msg-1",
      },
    };
    const second = {
      ...first,
      proposed_values: {
        bundle_key: bundleKey,
        source_email_id: "gmail-msg-2", // later email, same lender
      },
    };
    assertEquals(queueSemanticKey(first), queueSemanticKey(second));

    // Persisted row shape (payload.on_approve_execution_payload.bundle_key)
    const persisted = {
      action_type: "create_followup_task",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      payload: {
        on_approve_execution_payload: { bundle_key: bundleKey },
      },
    };
    assertEquals(queueSemanticKey(persisted), queueSemanticKey(first));
  },
);

Deno.test(
  "schedule-call key is distinct from funding_source_attention key on same lender",
  () => {
    const scheduleKey = queueSemanticKey({
      action_type: "create_followup_task",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      proposed_values: { bundle_key: `schedule_call:${DEAL_ID}:${LENDER_ID}` },
    });
    const attentionKey = queueSemanticKey({
      action_type: "update_funding_source",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      proposed_values: { status: "Terms Issued" },
    });
    if (scheduleKey === attentionKey) {
      throw new Error(
        `schedule-call key must not collide with funding_source_attention key (got ${scheduleKey})`,
      );
    }
  },
);

/**
 * OUTBOUND-AWAITING-REPLY trigger: a draft_email nudge targeting a
 * deal_lender must (a) pass the scope whitelist and (b) dedupe under
 * the same `funding_source_attention` semantic key as other lender
 * nudges so we never surface two follow-up drafts for the same lender
 * on the same deal in a single scan.
 */
Deno.test(
  "outbound-awaiting-reply draft_email is in scope for lender target",
  () => {
    const followup: CandidateItem = baseCandidate({
      action_type: "draft_email",
      item_title: "Follow up: LAGO Innovation on Censys",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      requires_send_ui: true,
      proposed_values: {
        to: ["partner@lago.example"],
        subject: "Re: Censys diligence",
        body: "Following up on my note from Mon 3/10 — any thoughts?",
        bundle_key: `lender_followup:${DEAL_ID}:${LENDER_ID}`,
      },
      evidence_summary:
        'Sent Mar 10: "any thoughts on next steps?" — no reply in 3 business days.',
    });
    assertEquals(isInDealAdminAgentScope(followup), true);
  },
);

Deno.test(
  "outbound-awaiting-reply dedupes with other lender-attention items",
  () => {
    const followupKey = queueSemanticKey({
      action_type: "draft_email",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      proposed_values: {
        bundle_key: `lender_followup:${DEAL_ID}:${LENDER_ID}`,
      },
    });
    const attentionKey = queueSemanticKey({
      action_type: "update_funding_source",
      target_object_type: "deal_lender",
      target_object_id: LENDER_ID,
      deal_id: DEAL_ID,
      proposed_values: { status: "Unresponsive" },
    });
    // Both should collapse into the single funding_source_attention slot
    // for this lender so the reviewer never sees two competing cards.
    assertEquals(followupKey, attentionKey);
  },
);
# Claap aiFields Compliance

Goal: every Claap Get Recording call requests `returnAiFields=true`, `aiFields` stays the primary parsing path, legacy `insightTemplates` remains as a temporary fallback, and we log enough to verify aiFields presence in both REST and webhook payloads. No matching logic touched.

## Findings

Get Recording call sites today:

- `supabase/functions/_shared/claap-api.ts:84` — shared `claapGetRecording` helper. **Missing** `returnAiFields=true`. Used by:
  - `supabase/functions/claap-bulk-sync/index.ts:47`
  - `supabase/functions/claap-backfill-summaries/index.ts:44`
  - `supabase/functions/claap-sync-recording-content/index.ts:59`
- `supabase/functions/claap-recordings/index.ts:241-242` — single-recording GET. Already sets `returnAiFields=true`.
- `supabase/functions/claap-recordings/index.ts:158-163` — list endpoint. Already sets `returnAiFields=true`.
- Transcript endpoints (`/transcript?format=text`) — unaffected, no change.

Parsing paths already prefer `aiFields` over `insightTemplates`:

- `supabase/functions/claap-recordings/index.ts:77-100` (`extractClaapInsights`)
- `supabase/functions/claap-webhook/index.ts:72-102` (`extractClaapInsights`)
- `supabase/functions/_shared/claap-api.ts:138-207` (`normalizeRecording`) — does NOT currently read `aiFields`; it only parses `outlines`, `actionItems`, `keyTakeaways`. This is fine for the summary/action-item normalization it owns, but it means callers of `claapGetRecording` cannot see aiFields downstream. We will pass the raw `aiFields` through on the normalized object as an opaque field for parity with the recordings function.

## Changes

### 1. `supabase/functions/_shared/claap-api.ts`
- Update `claapGetRecording` (line 84) to build the URL with `returnAiFields=true`:
  ```
  const url = new URL(`${CLAAP_API_BASE}/recordings/${encodeURIComponent(externalId)}`);
  url.searchParams.set("returnAiFields", "true");
  ```
- After parsing JSON, add a single-line console log indicating aiFields presence and count, e.g.
  `console.log("[claap] getRecording", externalId, "aiFields=", Array.isArray(r?.aiFields) ? r.aiFields.length : "absent", "insightTemplates=", Array.isArray(r?.insightTemplates) ? r.insightTemplates.length : "absent")`
- Extend `NormalizedClaapRecording` with optional `ai_fields?: Array<{key,label,value,type}>` and `insight_templates_present?: boolean` so downstream callers can confirm rollout, and populate them in `normalizeRecording`. Leave existing summary/action-item logic untouched (aiFields stays primary for insight rendering via the existing `extractClaapInsights`).
- Also apply the same `returnAiFields=true` query param to `claapListRecordings` (line 212) for consistency.

### 2. `supabase/functions/claap-recordings/index.ts`
- Already sets `returnAiFields=true` on list (line 163) and get (line 242). No URL changes.
- Add concise logging right after each successful Claap response parse:
  - list: log count of recordings + how many include `aiFields`.
  - get: log `aiFields` length / `insightTemplates` length for the requested recording id.

### 3. `supabase/functions/claap-webhook/index.ts`
- No parsing change (`extractClaapInsights` already prefers `aiFields`).
- At the top of the webhook handler, after JSON-parsing the incoming payload, log a single line:
  `console.log("[claap] webhook", payload.event, payload.data?.id, "aiFields=", Array.isArray(payload.data?.aiFields) ? payload.data.aiFields.length : "absent", "insightTemplates=", Array.isArray(payload.data?.insightTemplates) ? payload.data.insightTemplates.length : "absent")`

### 4. Not changed
- `claap-backfill`, `claap-deal-analyze`, `claap-webhook-ingest`, `claap-bulk-sync`, `claap-backfill-summaries`, `claap-sync-recording-content` — they all funnel Get Recording through the shared `claapGetRecording`, so the helper fix in #1 covers them automatically. Transcript endpoints stay untouched.
- All Claap matching/scoring/routing logic (`claap-score-recording`, `claap-rank-recordings-for-meeting`, `claap-suggest-matches`, `claap-webhook` deal-matching block) is untouched.

## Verification after deploy

- Edge logs for `claap-recordings` and `_shared` helper should print `aiFields=<n>` on every fetch.
- Edge logs for `claap-webhook` should show `aiFields=<n>` on inbound events.
- If any log shows `aiFields=absent` while `insightTemplates=<n>`, that confirms the legacy fallback is still doing work and should remain until rollout completes.

## Reported file/line changes (final summary will list exact line numbers post-edit)

- `supabase/functions/_shared/claap-api.ts` — `claapGetRecording` URL + log + `NormalizedClaapRecording` fields + `normalizeRecording` population; `claapListRecordings` URL.
- `supabase/functions/claap-recordings/index.ts` — add log statements after list and get responses (no URL change).
- `supabase/functions/claap-webhook/index.ts` — add inbound payload log (no parsing change).

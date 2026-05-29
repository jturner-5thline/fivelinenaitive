# Claap Intelligent Mapping System

A scored entity-resolution engine that ranks Claap recordings against meetings, contacts, companies, and deals — running both at webhook-time and as an end-of-day reconciliation pass — with an inline Mapping panel and a global Review queue.

## 1. Database schema (new migration)

New tables (tenant-scoped via `org_company_id`, RLS via existing `has_org_company_access` pattern):

- **`claap_recordings`** — canonical per-recording record
  - `id`, `org_company_id`, `external_id` (unique per tenant), `title`, `started_at`, `ended_at`, `organizer_email`, `participants jsonb`, `transcript_available bool`, `source_payload jsonb`, `status` (`new` | `scored` | `linked` | `review` | `ignored`), `last_scored_at`, timestamps
  - Backfilled from existing `deal_claap_recordings` + Claap webhook payloads
- **`claap_recording_candidates`** — every scored candidate
  - `id`, `recording_id` (FK), `entity_type` (`meeting`|`contact`|`company`|`deal`), `entity_id uuid`, `score numeric(4,3)`, `rank int`, `reasons jsonb` (array of `{code,label,weight}`), `evidence jsonb`, `run_type` (`post_call`|`end_of_day`), `created_at`
  - Unique `(recording_id, entity_type, entity_id, run_type)`
- **`claap_recording_links`** — confirmed links (auto or manual)
  - `id`, `recording_id`, `entity_type`, `entity_id`, `link_role` (`primary_meeting`|`attendee_contact`|`primary_company`|`primary_deal`|`secondary_deal`), `confidence numeric`, `source` (`auto`|`manual`|`eod`), `created_by uuid`, `created_at`
  - Unique `(recording_id, link_role, entity_id)` so multiple attendee_contacts allowed but one primary_*
- **`claap_mapping_reviews`** — review log
  - `id`, `recording_id`, `candidate_id nullable`, `reviewer_id`, `resolution` (`accepted`|`rejected`|`overridden`), `override_reason text`, `feedback jsonb`, `created_at`

All four get explicit `GRANT`s for `authenticated` + `service_role` and tenant-scoped RLS policies (read/write only within the user's `org_company_id` via the existing helper). Indexes on `(org_company_id, status)`, `(recording_id, entity_type, rank)`, `(entity_type, entity_id)`.

## 2. Scoring engine (edge function `claap-score-recording`)

Pure-TS module `_shared/claap-scoring.ts` consumed by both the post-call and EOD entry points. Inputs: `recording_id`, `run_type`. Loads recording, then per entity type:

**Meeting (0–1):**
- Time overlap with `meetings.start_time/end_time` window (Jaccard-style) → up to 0.45
- Organizer email exact match → +0.20
- Participant email overlap ratio → up to 0.20
- Title similarity (dice coefficient via existing `utils/stringSimilarity`) → up to 0.10
- Same calendar source / external id → +0.05

**Contact (0–1):**
- Exact email match on `contacts.email` → 0.95 floor
- Normalized full name match (org-scoped) → 0.70
- Fuzzy name + same domain as participant → 0.55
- Boost +0.05 if contact participated in a meeting in last 14d

**Company (0–1):**
- Derived from matched contacts' `company_id` (max child score, capped 0.85)
- Organizer domain ↔ `companies.domain` exact → +0.20
- Title/transcript mention of legal name → +0.10
- Active deal on that company in last 30d → +0.05

**Deal (0–1):**
- Inherited from matched meeting's `deal_id` → 0.90
- Matched company + active (non-stale) deal → up to 0.70, with recency decay
- Keyword overlap of title/transcript with deal `company`, `borrower`, lender names → up to 0.40
- Penalty −0.20 for stale (`updated_at` > 60d) without meeting linkage
- Email/domain evidence outranks transcript-only mentions (transcript-only capped at 0.74)

**Inheritance:** when meeting score ≥ 0.65, seed contact/company/deal candidate lists from the meeting before global search; merge on max(score) + union of `reasons`.

**Writes:** all candidates upserted to `claap_recording_candidates` (replacing same `run_type`); top candidate per `entity_type` with score ≥ 0.90 → upsert `claap_recording_links` with `source = run_type === 'end_of_day' ? 'eod' : 'auto'`; recording `status` set to `linked`, `review` (any 0.65–0.89), or `new`.

Each `reasons` entry is `{code, label, weight}` (e.g. `{code:'time_overlap', label:'Time overlap 92%', weight:0.41}`) for plain-English rendering.

## 3. Post-call trigger

Existing Claap webhook handler (or `claap-recordings` ingestion path) calls the new edge function with `run_type='post_call'` after upserting the `claap_recordings` row. No behavior change for already-linked deal recordings — they short-circuit to inherited candidates.

## 4. End-of-day reconciliation (`claap-eod-reconcile`)

- Cron via `pg_cron` + `pg_net`, nightly per tenant
- Selects recordings from last 48h where `status IN ('new','review')` OR top candidate < 0.90
- Calls scoring engine with `run_type='end_of_day'`
- Promotes to `claap_recording_links` (source `eod`) when new evidence pushes a candidate ≥ 0.90
- Flags conflicts (two candidates same entity_type within 0.05 of each other, both ≥ 0.75) → `status='review'`

## 5. RPCs

- `claap_accept_suggestion(candidate_id uuid, link_role text)` — security definer, validates tenant, inserts into `claap_recording_links` with `source='manual'`, logs to `claap_mapping_reviews` with `resolution='accepted'`
- `claap_reject_suggestion(candidate_id uuid, reason text)` — logs rejection, removes the candidate from suggestions (soft via `rank = -1`)
- `claap_mark_unrelated(recording_id, entity_type)` — suppresses all candidates of that type
- Helper `has_org_company_access(uuid)` reused from existing patterns

## 6. UI

**Mapping panel** (`src/components/claap/ClaapMappingPanel.tsx`) — embedded on the Claap recording detail page:
- Four sections (Meeting / Contacts / Company / Deals)
- Each row: entity name, confidence %, source badge (`Auto-linked` | `Suggested (post-call)` | `Suggested (EOD)` | `Manual`), bullet reasons
- Actions per row: **Accept**, **Reject**, **Search manually** (opens existing `EntitySearchModal`), **Mark unrelated**
- Sticky footer: **Accept all ≥ 90%**

**Global review queue** (`src/pages/ClaapMappingReview.tsx`, route `/claap/review`):
- Table of recordings with pending suggestions, filterable by entity_type, confidence band, run_type
- Row expands to show same Mapping panel
- Linked from existing Claap nav + sidebar badge (count of `status='review'`)

**Hooks:** `useClaapMappingCandidates(recordingId)`, `useClaapReviewQueue(filters)`, `useAcceptClaapSuggestion()`, `useRejectClaapSuggestion()` — React Query, realtime subscribe to `claap_recording_candidates` and `_links`.

## 7. Technical details

- All scoring + writes happen server-side in edge functions; client only reads candidates and posts to RPCs.
- `verify_jwt` defaults; functions call `supabase.auth.getUser()` and resolve `org_company_id` via existing membership helpers; 401 if missing.
- Reuses `src/utils/stringSimilarity.ts`, `src/lib/extractEmailDomain.ts`, `src/lib/internalDomains.ts` for normalization.
- Auditable: every link references the candidate row, every candidate keeps `reasons`+`evidence` JSON; `claap_mapping_reviews` records human resolutions.
- Backwards compatible with existing `deal_claap_recordings` (kept as denormalized cache for the deal Data Room); a trigger mirrors `primary_deal` links into it.
- Per the AI/human-in-the-loop memory rule, only ≥ 0.90 auto-links write; everything else requires explicit Accept.

## 8. Files

```text
supabase/migrations/<ts>_claap_mapping_system.sql
supabase/functions/_shared/claap-scoring.ts
supabase/functions/claap-score-recording/index.ts
supabase/functions/claap-eod-reconcile/index.ts
src/hooks/useClaapMapping.ts
src/components/claap/ClaapMappingPanel.tsx
src/components/claap/ClaapMappingRow.tsx
src/pages/ClaapMappingReview.tsx          (+ route in App.tsx)
```

Existing `useClaapSuggestions` / `claap-suggest-matches` stay in place during cutover; the new panel reads from `claap_recording_candidates` and gradually replaces it.

Approve to scaffold the migration first, then the edge functions and UI in parallel.

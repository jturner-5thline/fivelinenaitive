## AI Recommended Lenders — Lenders tab

Add a new collapsible **AI Recommended** section pinned above the existing lenders board on the Lenders tab of the deal detail page. It calls Claude (via the existing centralized proxy) with the deal context + master lender directory and renders the top 5–10 ranked matches with one-click add/skip.

### Database (1 new table)

`deal_lender_recommendation_exclusions`
- `deal_id uuid` (indexed)
- `lender_name text` (case-insensitive unique per deal)
- `excluded_by uuid` (auth.uid())
- `org_company_id uuid` (RLS scoping consistent with deals)
- standard timestamps
- RLS: members of the deal's `org_company_id` can read/insert/delete

Used for the Skip action and the "Reset exclusions" control. No cache table — recommendations are recomputed on demand.

### Edge function: `recommend-lenders`

- `verify_jwt` enabled, validates `supabase.auth.getUser()`
- Input: `{ dealId }`
- Server pulls:
  - deal record (type, size, industry, sponsorship, narrative, write-up sections)
  - data-room document titles + summaries
  - master lender directory (shared + workspace lenders)
  - exclusion list + lenders already on the deal (excluded automatically)
- Calls Claude with a strict JSON schema and the weighted scoring rubric in the system prompt:
  - Deal type alignment 40%
  - Deal size fit 30%
  - Industry match 20%
  - Recent activity in naitive (last 90d) 10%
- Returns `{ recommendations: [{ lenderId, lenderName, logoUrl, matchScore, rationale, components }], generatedAt, sufficiency: { ok, missing[] } }`
- Caps to 10 items, filters anything below 50% score.

### Frontend

New `src/components/deal/AiRecommendedLendersSection.tsx`:
- Collapsible card (Liquid Glass styling) with header: title, count badge, Refresh, Reset exclusions, Collapse toggle.
- Persists collapsed state in `user_ui_preferences`.
- Auto-runs on mount when sufficiency check passes (deal type + deal size + at least one of: Deal Space financials, Write Up narrative, Data Room documents).
- Friendly empty state when sufficiency fails listing what's missing.
- Each recommendation card:
  - Lender logo + name
  - Match score chip (85+ green, 70+ blue, 50+ amber)
  - One-line rationale from Claude
  - **+ Add to Deal** → small stage selector popover (default: "NDA/Needs List Sent" if present, else first stage). On confirm calls existing `addLenderToDeal`, optimistically removes the card, shows "✓ Added" toast.
  - **✕ Skip** → inserts into exclusions table, removes the card.
- Loading shows skeletons; errors show retry CTA.

Integration in `DealDetail.tsx`:
- Render `<AiRecommendedLendersSection />` at the very top of `TabsContent value="lenders"`, above the current `LenderSuggestionsPanel` trigger and kanban summary.
- Reuses existing add-lender handler and `existingLenderNames` already wired to the kanban.

### Hooks

- `useAiRecommendedLenders(dealId)` — React Query; invokes `recommend-lenders`; exposes `data`, `isLoading`, `refetch`, and a `skip(lenderName)` mutation.
- `useDealRecommendationExclusions(dealId)` — list + reset.

### Out of scope

- Existing rule-based `LenderSuggestionsPanel` dialog stays as-is — the new section sits above it.
- No changes to other tabs, kanban internals, or unrelated pages.

### Open question

Use the existing Anthropic proxy (`claude-chat` per the **Claude AI Engine** memory) or create a dedicated `recommend-lenders` function calling the same upstream? Plan assumes a new dedicated function so the prompt and JSON schema stay server-side and auditable.

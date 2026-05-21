# Align AI pipeline scope with the dashboard

## Problem

The dashboard shows 7 active deals at 5th Line (default pipeline, status=active), but the AI says 476 active deals / $2.5BN because `get_pipeline_summary`, `search_deals`, `get_stale_deal_alerts`, and several other tools query `deals` without scoping by `company_id`, pipeline, or status — they only get whatever RLS hands them. For a 5th Line admin (who has cross-tenant visibility), that returns thousands of rows. Users can't reconcile any AI claim against the UI.

## Approach

1. **Frontend computes one canonical `chatScope` object every turn** and sends it to `copilot-chat`. Shape:
   ```
   {
     company_id: string | null,        // active workspace (PipelineContext)
     pipeline_id: string | null,       // active default/selected pipeline
     status_filter: 'active' | 'all',  // 'active' = exclude closed/on-hold/archived
     include_archived: boolean,
     label: string                     // "5th Line · Active Pipeline · Active only"
   }
   ```
   Read from `PipelineContext` / current company override / the same selector the dashboard uses, so the chat header and the AI tool calls are always in lockstep with what the UI is showing.

2. **Edge function `copilot-chat` accepts `context.chatScope`** and threads it into every deal-touching tool. Tools updated:
   - `search_deals` — add `.eq('company_id', scope.company_id)` and stage/status filter when `status_filter='active'`. Add explicit "broaden scope" hint in the no-results response.
   - `get_pipeline_summary` — already filters active/all; additionally scope to `company_id` + `pipeline_id` and report `scope.label` in the response so the AI's narration matches the chip.
   - `get_stale_deal_alerts`, `list_finserv_deals`, `get_finserv_pipeline_summary`, `get_partner_pipeline_summary`, `get_deals` — same scoping.
   - `get_deal` / `get_deal_full` — allow out-of-scope reads (so the user can still look up a closed deal by name) but tag the response with `out_of_current_scope: true` so the model warns the user.
   - Off-page deal resolver — restricted to scope by default; if no match, retry across all scopes once and surface "I found this in <other workspace>".

3. **System prompt update** — add a `CURRENT SCOPE` block printed verbatim above the existing CURRENT CONTEXT, plus a rule: "Every pipeline number you report (counts, totals, lists) MUST come from a tool call made within the CURRENT SCOPE. If you cite a deal outside the current scope, explicitly say so."

4. **Chat header UI**:
   - Replace the existing "Context:" chip with a `ScopeChip` showing `<workspace> · <pipeline> · <status>` plus the live count from `useDealsContext` filtered by the same scope ("7 deals").
   - Add a `ScopeMenu` dropdown (Radix `DropdownMenu`) with:
     - Workspace: current workspace ▾ / All workspaces (admin only)
     - Pipeline: current pipeline ▾ / All pipelines
     - Status: Active only / Include closed & on-hold / Include archived
   - Persist the selection in `sessionStorage` under `naitive.copilot.chat_scope` so it survives panel close but resets per tab.
   - When the user changes scope, replay the chip count and post a system message in the chat: "_Scope changed → 5th Line · Active Pipeline · Active only (7 deals)._"

5. **Acceptance verification**:
   - On the 5th Line workspace with default scope, `get_pipeline_summary` returns `{ total: 7, active: 7, scope_label: "5th Line · Active Pipeline · Active only" }`, matching the dashboard.
   - Searching "Turbine" with default scope returns the Turbine deal only if it is in the active 5th Line pipeline; otherwise the AI says "Turbine exists but is outside your current scope (in <workspace/pipeline>). Want me to broaden the scope?".
   - Header chip count equals `Active Deals` KPI tile.
   - Changing the dropdown to "All workspaces" makes the AI's totals jump and the chip count update.

## Open questions (need answers before I build)

1. **What exactly defines "Active Pipeline" in the 5th Line dashboard tile that shows 7?** I see three candidates in the codebase: `deals.company_id` + the company's default `deal_pipelines` row + `status IN ('active')`, or a hardcoded `deal_class` filter, or the FinServ vs Debt split. Can you confirm? My default is: `company_id = current company` AND `pipeline_id = is_default pipeline of that company` AND `status NOT IN ('closed','on-hold','archived')` AND `stage NOT IN ('closed-won','closed-lost')`, plus the existing global exclusions (`Test-Niki's Store`, `Example Deal`, `test *`).
2. **"All workspaces" option** — should this be visible to every user or gated to the 5th Line internal allowlist? (My default: gated; non-admins only see workspace switcher options matching their `company_members` rows.)
3. **Out-of-scope deal references** — if the AI knows of a deal outside scope (e.g. user asks "what's on BT Advisory?" and BT Advisory is archived), should we (a) refuse, (b) answer but flag, or (c) silently auto-broaden? My default is (b).

If you're happy with the defaults in parens, just say "go" and I'll ship it.

## Technical notes

- `PipelineContext` already exposes the current company + pipeline; reuse it instead of re-deriving from URL.
- Tool changes are mechanical `.eq('company_id', …)` / `.in('status', …)` additions; the heaviest lift is `search_deals` because of its fuzzy-rank path — add the filter at the SQL `select` stage, before scoring, so ranking still works.
- Header chip count uses `useDealsContext` (already filters by workspace) + a local memo that applies the active scope filter — no extra round-trip.
- No DB migration needed; this is pure query-shape + UI work.

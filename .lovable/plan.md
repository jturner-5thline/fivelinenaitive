## Phase 1 PLAN — Rename "Usage Analytics" → "Analytics" + Pilot KPI Tracking

Strictly additive. No code/migrations executed yet. Waiting for "approved".

---

### PART A — Global rename "Usage Analytics" → "Analytics"

**Full occurrence sweep** (`rg -i "usage.analytics|usage_analytics|usage-analytics"` across `src/` + `supabase/`):

| File | Line | Current | Action |
|---|---|---|---|
| `src/pages/Admin.tsx` | 47 | `import { UsageAnalyticsPanel } from "@/components/admin/usage-analytics/UsageAnalyticsPanel"` | **Keep** (import path stable; component name unchanged — internal identifier) |
| `src/pages/Admin.tsx` | 101 | `const usageAnalyticsSubPages = [...]` | **Keep** variable name |
| `src/pages/Admin.tsx` | 111 | `TabCategory = ... \| "usage-analytics" \| ...` | **Keep** slug id (see redirect below) |
| `src/pages/Admin.tsx` | 127 | `label: "Usage Analytics"` | **Change** label → `"Analytics"` |
| `src/pages/Admin.tsx` | 150 | `"usage-analytics": "usage-overview"` | **Keep** (internal) |
| `src/pages/Admin.tsx` | 555 | `case "usage-overview":` | **Keep** + add new `"pilot-kpis"` case (Part B) |
| `src/components/admin/usage-analytics/UsageAnalyticsPanel.tsx` | 148 | CSV filename `usage-analytics_...csv` | **Change** → `analytics_...csv` (user-facing filename) |
| `src/components/admin/usage-analytics/UsageAnalyticsPanel.tsx` | 186 | `<header>Usage Analytics</header>` | **Change** → `"Analytics"` |
| `src/lib/usageLogger.ts` | 4 | JSDoc comment "Admin Usage Analytics dashboard" | **Change** → "Admin Analytics dashboard" (comment only) |
| `supabase/migrations/20260504011947_*.sql` | 1 | SQL comment | **Do NOT edit** (migrations are immutable / read-only per rules) |

**Items confirmed NOT present** (so nothing to update):
- No i18n / translation key for "usage analytics" — project has no i18n system in use for admin labels.
- No command palette entry referencing "usage analytics" (GlobalSearch.tsx grep: 0 hits).
- No AI Copilot tool registry entry named `usage_analytics` (grep across `src/lib/copilot*` + `services/`: 0 hits).
- No sidebar tooltip/aria-label referencing the string (admin nav uses the same `SECTIONS[].label` source-of-truth at line 127).
- Breadcrumbs derive from route segments via `routeLabels` in `src/components/AppBreadcrumb.tsx` — no `usage-analytics` key, falls through to segment. No change needed (the visible label inside Admin is driven by `SECTIONS`, not the breadcrumb).
- No `document.title` literal — Admin page uses generic title.

**Route slug**: stays `/admin?section=usage-analytics&tab=usage-overview`. Per scope rule "Out of scope: edge-function names, RLS, DB names". The route slug is an internal URL parameter, not a user-facing label — keeping it stable means **zero deep-link breakage** and **no redirect needed**. (User asked for a redirect "if it currently includes 'usage'"; cleanest path is to not rename the slug at all. If you insist on slug rename, say so on approval and I'll add a `useEffect` that rewrites `?section=usage-analytics` → `?section=analytics` and keeps a back-compat alias in the SECTIONS lookup.)

**Net A**: 3 user-visible string changes + 1 JSDoc comment. No identifier renames, no path renames, no migration edits.

---

### PART B — Pilot KPI tracking (Asana 1213766012868359)

**NEW DDL** (single migration, additive):

```sql
-- pilot_kpi_events: append-only event log for pilot KPI tracking
CREATE TYPE public.pilot_kpi_event_type AS ENUM (
  'deal_created','initial_login','session_heartbeat','visit',
  'feedback_given','feedback_call_attended','demo_converted','pilot_converted'
);

CREATE TABLE public.pilot_kpi_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type    public.pilot_kpi_event_type NOT NULL,
  deal_id       UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pke_company_time ON public.pilot_kpi_events(company_id, occurred_at DESC);
CREATE INDEX idx_pke_deal         ON public.pilot_kpi_events(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_pke_type_time    ON public.pilot_kpi_events(event_type, occurred_at DESC);

ALTER TABLE public.pilot_kpi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pke_admin_select_same_company" ON public.pilot_kpi_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND company_id = ANY (public.get_user_company_ids(auth.uid()))
  );
-- No INSERT/UPDATE/DELETE policies → only service_role (edge function) can write.

CREATE TABLE public.deal_kpi_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  kpi_event_id  UUID NOT NULL REFERENCES public.pilot_kpi_events(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, kpi_event_id)
);
CREATE INDEX idx_dkl_deal ON public.deal_kpi_links(deal_id);

ALTER TABLE public.deal_kpi_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dkl_admin_select_same_company" ON public.deal_kpi_links
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_kpi_links.deal_id
        AND d.company_id = ANY (public.get_user_company_ids(auth.uid()))
    )
  );
```

(Helper fn names `is_admin` and `get_user_company_ids` match existing project conventions per memory notes; Phase 2 will verify exact signatures before running.)

**NEW edge function** `supabase/functions/pilot-kpi-ingest/index.ts`:
- `verify_jwt = true`, validates `auth.getUser()`, derives `company_id` from `company_members`.
- Zod body schema: `{ event_type, deal_id?, metadata? }`.
- Inserts via service-role client into `pilot_kpi_events`; if `deal_id` present, also inserts `deal_kpi_links` (ON CONFLICT DO NOTHING on the unique pair).
- Rate-limit: drops `session_heartbeat` events that arrive < 25s after the last heartbeat for `(user_id, deal_id?)`.

**NEW client surface**:
- `src/hooks/analytics/useSessionHeartbeat.ts` — 30s interval while `document.visibilityState === 'visible'`, posts `session_heartbeat`. Gated by `ff_pilot_kpi_tracking`.
- `src/hooks/analytics/usePilotKpiTracking.ts` — fires `initial_login` once per session, `visit` on route change (debounced 1/route/session).
- `src/components/admin/usage-analytics/PilotKpiOverview.tsx` — 8-tile grid (one per event_type, count + 14-day sparkline) + "Per-Deal KPI" table joining `deal_kpi_links → pilot_kpi_events → deals`. Same Liquid Glass styling as `UsageAnalyticsPanel`.
- Wire as new sub-page in `usageAnalyticsSubPages`: `{ id: "pilot-kpis", label: "Pilot KPIs", icon: Activity }` and new `case "pilot-kpis":` at Admin.tsx line ~556.

**Demo-access hook insertion point**:
- Confirmed file (Phase 1 search): `src/hooks/useNaitivePipelineData.ts` defines the `demo-access` stage (line 16). The actual transition handler lives in the naitive-pipeline stage-change flow — Phase 2 step 1 will `rg "demo-access" src/components/naitive-pipeline/` to pin the exact mutation callsite (most likely `useUpdateDealStage` or a stage-action handler). The additive call will be a single `await supabase.functions.invoke('pilot-kpi-ingest', { body: { event_type: 'demo_converted', deal_id }})` fired **after** the existing stage-change resolves successfully. Response shape of the existing flow unchanged. If `ff_pilot_kpi_tracking` is OFF, the call short-circuits client-side (no network).

**Feature flag wiring** (mirrors `ff_ai_settings_mutations`):
- Insert row into `feature_flags` table: `flag_key='ff_pilot_kpi_tracking'`, default `enabled=false`, with a `company_feature_overrides` row enabling it for 5th Line `company_id`.
- New hook `useFeatureFlag('ff_pilot_kpi_tracking')` already exists via `useFeatureFlags.ts` — reuse, no new hook.
- All 4 client tracking surfaces (`useSessionHeartbeat`, `usePilotKpiTracking`, demo-access side-effect, `PilotKpiOverview` data fetch) gated behind it.

---

### PART C — Phase-2 test matrix

**Unit (Vitest)**
1. `pilot-kpi-ingest` accepts each of 8 event_types, writes one row.
2. `deal_id` nullable for non-deal events (e.g., `initial_login`, `session_heartbeat` without deal).
3. UNIQUE(deal_id, kpi_event_id) — second link insert returns 0 rows affected.
4. Heartbeat debouncer drops <25s repeats.

**RTL**
5. `<PilotKpiOverview />` renders 8 tiles with stubbed counts.
6. Drilldown table renders joined rows.
7. Old string `"Usage Analytics"` absent from Admin DOM; new `"Analytics"` present in tab + header.

**Integration**
8. Posting `demo_converted` with `deal_id` auto-creates the `deal_kpi_links` row.

**Regression sweep (must remain green)**
- Prompt 3 RTL 6/6
- Prompt 4 Deno 12/12
- SettingsMutationCard E2E
- Smart Status Note 30/30
- `newsletterSenderDetection` 10/10 (in-flight Update Lender fix)

**Live verification (5th Line, jturner@5thline.co)**
- `/admin` → tab #7 reads "Analytics".
- Click in → see "Company Overview" + new "Pilot KPIs" sub-page.
- Pilot KPIs tiles show non-zero for `initial_login` and `visit` (heartbeat will populate after ~1 min idle).
- Trigger demo-access on a test deal → confirm new `pilot_kpi_events` row + `deal_kpi_links` row (read-only SELECT via supabase tools).

---

### Strict freeze compliance

Confirmed untouched: `SettingsMutationCard`, `useSettingsMutation`, `AICopilotPanel`, `ChatMessageList`, `ai-settings-tool`, `ai-settings-apply`, `settings_audit_log`, `ff_ai_settings_mutations`, in-flight Update Lender files (`newsletterSenderDetection`, `ai_action_log`, `EmailQuickActionsToolbar`, `useThreadWorkflowAnalysis`, `aiAssistRefusalLogger`), Schedule Meeting / Notes / Draft Reply / Stale Nudge / Availability / calendar render / meeting-holds / calendar-events / send-pipeline / email ingestion classifier, `create_calendar` / `calendar_id` / `GCAL_SMOKETEST_CALENDAR_ID` (remain default-off).

Zero existing rows mutated. No destructive migrations. 5th Line only for live verification.

---

### File summary

**NEW (6)**
- `supabase/migrations/<ts>_pilot_kpi_tracking.sql`
- `supabase/functions/pilot-kpi-ingest/index.ts`
- `src/hooks/analytics/useSessionHeartbeat.ts`
- `src/hooks/analytics/usePilotKpiTracking.ts`
- `src/components/admin/usage-analytics/PilotKpiOverview.tsx`
- `src/components/admin/usage-analytics/__tests__/PilotKpiOverview.test.tsx`

**TOUCHED (4)**
- `src/pages/Admin.tsx` — label "Analytics", add `pilot-kpis` sub-page + case, mount `usePilotKpiTracking`.
- `src/components/admin/usage-analytics/UsageAnalyticsPanel.tsx` — header text + CSV filename.
- `src/lib/usageLogger.ts` — JSDoc comment.
- `supabase/config.toml` — register new edge function (verify_jwt=true).
- Demo-access stage-change handler (exact file pinned in Phase 2 step 1) — one additive post-success call.

**Awaiting your "approved" before any code/migrations.**


# Phase 1 — Active-pipeline deal status-text update notification

Phase 1 = plan only. No code, no migrations, no test emails until "approved".

## Important model-correction (needs your sign-off)

The `deal_status_notes` table is **insert-only / append-only** — there is no `UPDATE` on a row's `note` field. Every "status text update" in the app is actually a **new row insert** via `addStatusNote()` in `src/hooks/useStatusNotes.ts`. The original prompt assumed an old → new mutation on a single field.

Proposed mapping (default unless you say otherwise):
- "Trigger" = `INSERT` into `deal_status_notes` (i.e. user posts a new status note on a deal).
- `old_value` = the most recent prior `deal_status_notes.note` for that `deal_id` (or null if first).
- `new_value` = the just-inserted `note`.
- Debounce: collapse all inserts by the same `(deal_id, actor_user_id)` within a 60s window into one email, using only the latest `new_value` and the `old_value` that was current at the start of the window.

If you instead want this to fire on edits to a deal-level free-text field (e.g. `deals.description` or a future `deals.status_text`), flag it and I'll re-plan.

## Files — new vs touched

New files:
- `supabase/migrations/<ts>_deal_status_notify.sql` — 3 tables + RLS + feature-flag row + seed.
- `supabase/functions/deal-status-notify/index.ts` — enqueue endpoint (JWT-verified).
- `supabase/functions/deal-status-notify-drain/index.ts` — cron-driven drainer (verify_jwt=false, shared-secret header).
- `src/lib/__tests__/dealStatusNotifyDebounce.test.ts` — dedupe_key + active-stage + escape unit tests.
- `supabase/functions/deal-status-notify/index.test.ts` — Deno integration test (skipped if no DB).

Touched (additive only):
- `src/hooks/useStatusNotes.ts` — after a successful insert in `addStatusNote`, fire-and-forget `supabase.functions.invoke('deal-status-notify', { body: { deal_id, new_value } })`. Never block the UI; never throw.
- `supabase/config.toml` — register `deal-status-notify-drain` with `verify_jwt = false`.

Out of scope (per freeze): SettingsMutationCard, AICopilotPanel, pilot KPI files, Schedule Meeting, NOTES, Draft Reply composer, Stale Status Nudge, calendar, send-pipeline, email ingestion classifier, newsletter-deny work, Update-Lender FIX prompt artifacts.

## Chokepoint

`src/hooks/useStatusNotes.ts` → `addStatusNote(note)` (lines ~39–61). Single app-layer chokepoint used by `StatusHistoryPopover`, `DealUpdatesUnified`, `DealActivityTab`, and `StaleStatusNudge`. No DB trigger — keeps notification next to existing telemetry per your instruction.

`old_value` is resolved **server-side** inside the enqueue edge function (re-query the second-most-recent `deal_status_notes` row by `created_at desc`), not from the client.

## Email provider + sender

- Provider in use: **Resend** (`RESEND_API_KEY` already configured; used by `send-notification-email`, `notify-feedback-submitted`).
- Sender: `naitive <noreply@updates.naitive.co>` (matches existing transactional sender; consistent SPF/DKIM).
- All 3 recipients delivered as **Bcc** on a single send; `to` = sender to avoid empty `to`.

## Deal-link URL pattern

`https://app.naitive.co/deals/<deal_id>?from=status-update-notification`

(Confirm: production app host is `app.naitive.co`. If preferred host is `naitive.co/deals/...`, swap before implementation. We will NOT use the lovable.app preview URL or `localhost`.)

## Active-stage definition

Reuses the existing single source of truth `isActiveDeal()` in `src/lib/deals.ts`. A deal is "active pipeline" iff `isActiveDeal({ stage, status }) === true`. Inactive keywords already covered: closed, lost, won, hold, paused, dead, do not contact, unqualified, dormant, churn, not a fit, archived, passed. If inactive → write a `skipped` log row with `skip_reason='stage_inactive'` and exit (no enqueue).

## Subject + body templates

Subject (default): `"<DEAL NAME> Has Been Updated"` — literal brackets dropped, deal name HTML-escaped in the body, plain in the subject header. (Confirm if you want brackets retained.)

Plain-text body:
```
The status for {DEAL_NAME} was updated by {ACTOR_FULL_NAME} at {TS_COMPANY_TZ}.

Previous: {OLD_TRUNCATED_1000}
Updated:  {NEW_TRUNCATED_1000}

Open deal: https://app.naitive.co/deals/{DEAL_ID}?from=status-update-notification

You are receiving this because you are on the 5th Line deal-status watch list.
Manage notifications: https://app.naitive.co/settings?tab=notifications
```

HTML body (semantic, inline-styled, no external CSS):
```
<p>The status for <strong>{DEAL_NAME_ESC}</strong> was updated by
   <strong>{ACTOR_ESC}</strong> at {TS_ESC}.</p>

<pre style="font-family:ui-monospace,Menlo,monospace;background:#f6f7f9;
            padding:12px;border-radius:6px;white-space:pre-wrap;
            font-size:13px;line-height:1.45">
Previous: {OLD_ESC_OR_EMPTY}
Updated:  {NEW_ESC_OR_EMPTY}</pre>

<p style="margin:24px 0">
  <a href="{DEAL_URL}"
     style="display:inline-block;background:#111;color:#fff;
            padding:12px 20px;border-radius:8px;text-decoration:none;
            font-weight:600">Open Deal in Naitive</a>
</p>
<p style="font-size:12px;color:#666">
  Or open directly: <a href="{DEAL_URL}">{DEAL_URL}</a>
</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
<p style="font-size:11px;color:#999">
  You are receiving this because you are on the 5th Line deal-status watch list.
  <a href="https://app.naitive.co/settings?tab=notifications">Manage notifications</a>.
</p>
```

Escape rules: all variables HTML-escaped (`& < > " '`) before interpolation. `{OLD_ESC_OR_EMPTY}` / `{NEW_ESC_OR_EMPTY}` render the literal string `(empty)` when null/blank, otherwise the escaped + truncated value (1000 chars + `…`).

## DDL (review only — not executed in Phase 1)

```sql
-- 1) Recipients (per-company watch list, seeded for 5th Line)
create table public.deal_status_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (company_id, lower(email))
);
alter table public.deal_status_notification_recipients enable row level security;
create policy "Same-company admins can read recipients"
  on public.deal_status_notification_recipients for select
  using (company_id = any (public.get_user_company_ids(auth.uid()))
         and public.is_admin(auth.uid()));
-- INSERT/UPDATE/DELETE: service-role only (no policy = denied).

-- 2) Queue (debounce + drain)
create table public.deal_status_notification_queue (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null,
  dedupe_key text not null unique,             -- ${deal_id}:${actor_user_id}:${floor(epoch/60)}
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.deal_status_notification_queue (status, changed_at);
alter table public.deal_status_notification_queue enable row level security;
-- No client policies; service-role only.

-- 3) Log (audit; immutable from client)
create table public.deal_status_notification_log (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null,
  old_value text,
  new_value text,
  recipient_emails text[] not null default '{}',
  subject text not null,
  status text not null check (status in ('sent','failed','skipped')),
  skip_reason text,
  provider_message_id text,
  sent_at timestamptz not null default now()
);
create index on public.deal_status_notification_log (deal_id, sent_at desc);
create index on public.deal_status_notification_log (company_id, sent_at desc);
alter table public.deal_status_notification_log enable row level security;
create policy "Same-company admins can read notification log"
  on public.deal_status_notification_log for select
  using (company_id = any (public.get_user_company_ids(auth.uid()))
         and public.is_admin(auth.uid()));
-- INSERT/UPDATE/DELETE: service-role only.

-- 4) Feature flag (default OFF)
insert into public.feature_flags (name, description, status)
values ('ff_deal_status_email_notifications',
        'Email 5th Line watch list when a deal status note is updated',
        'disabled')
on conflict (name) do nothing;

-- 5) Seed 5th Line recipients (company 44556c46-9127-4b12-b14e-d6fee784afcf)
insert into public.deal_status_notification_recipients (company_id, email) values
  ('44556c46-9127-4b12-b14e-d6fee784afcf','jmoffitt@5thline.co'),
  ('44556c46-9127-4b12-b14e-d6fee784afcf','jturner@5thline.co'),
  ('44556c46-9127-4b12-b14e-d6fee784afcf','swilliams@5thline.co')
on conflict do nothing;
```

## Feature-flag wiring

- Flag name: `ff_deal_status_email_notifications` (uses existing `feature_flags` infra; same shape as `ff_pilot_kpi_tracking`).
- 5th Line tenant (`company_id = 44556c46-…afcf`) → treated as enabled regardless of flag value (hard-coded allowlist inside `deal-status-notify`, matching the 5th Line gating pattern already in `useNaitivePipelineAccess` / proprietary-access).
- Other tenants → only enqueue when `feature_flags.status in ('staging','deployed')` AND a recipients row exists for that company.

## Cron / scheduled drain

- Edge function `deal-status-notify-drain` (verify_jwt=false; protected by `x-cron-secret` header against `DEAL_STATUS_NOTIFY_CRON_SECRET`).
- Scheduled via `pg_cron` + `pg_net` every 60s (same pattern as other scheduled functions in this project). Cron SQL is inserted via the `supabase--insert` tool (not migrations) since it embeds the project ref and anon key.
- Drain selects `status='pending' AND changed_at < now() - interval '60 seconds'` ordered by `changed_at asc`, LIMIT 50, `FOR UPDATE SKIP LOCKED`, flips to `'sending'`, sends via Resend (single send, all recipients in `bcc`), then writes `'sent'` + `provider_message_id` to queue and a row to `_log`. On Resend error → `attempts++`, `status='pending'` again until `attempts >= 5` → `'failed'` + log row with `status='failed'`.

## Per-user mute

- Read from `profiles.preferences->>'deal_status_notifications_muted'` (existing JSONB column on profiles — confirm in implementation; if missing we add a nullable JSONB column in the same migration). For each recipient email, look up matching `profiles.email` and skip if muted; write a `skipped` log row with `skip_reason='user_muted'` and the muted recipients in `recipient_emails`.

## Loop guard

Actor is NEVER excluded from BCC (per your instruction). All 3 addresses always receive when not muted.

## Defensive rate-limit

Before Resend send, drain re-checks: no `deal_status_notification_log` row exists with the same `(deal_id, recipient_email)` within the last 60s. If any recipient is rate-limited → drop only that address from BCC; if all 3 drop → status='skipped', skip_reason='rate_limited'.

## Phase-2 test matrix

Unit (Vitest, `src/lib/__tests__/dealStatusNotifyDebounce.test.ts`):
1. `dedupeKey(deal, actor, t)` collapses 5 timestamps within a 60s bucket → 1 key, 1 across boundary → 2 keys.
2. `isActiveDeal` integration: stages `closed-won|closed-lost|on-hold|archived|dead|passed` → skipped; `in-due-diligence|lenders-in-review|term-sheet|active` → enqueued.
3. `renderDiff(null,'B')` → `Previous: (empty)\nUpdated:  B`; `renderDiff('A',null)` → `Updated:  (empty)`.
4. Subject formatter handles deal names with quotes and emoji.
5. HTML escape: deal name `"<script>alert(1)</script>"` and note `"<img onerror=...>"` appear escaped (`&lt;script&gt;`) in HTML body, never as live tags. Plain-text body unchanged but un-rendered.
6. Truncation at 1000 chars appends `…` and never breaks inside an HTML entity.

Edge-function integration (Deno, `supabase/functions/deal-status-notify/index.test.ts`):
7. POST without JWT → 401.
8. POST with deal in inactive stage → 200 + 0 queue rows + 1 log row `skipped/stage_inactive`.
9. POST 5× within 60s same actor+deal → 1 queue row (UNIQUE on dedupe_key), `new_value` = last write.
10. POST with company that has no recipients row AND flag disabled → 0 queue rows + 1 log row `skipped/no_recipients`.

Live (5th Line tenant, designated test deal — NOT a production deal):
11. Edit status note on a deal in stage `in-due-diligence` → exactly 1 BCC email arrives at all 3 inboxes within ~60–120s with correct subject, diff, working CTA, footer.
12. Edit twice in 30s → still exactly 1 email; `Updated` = final text; `Previous` = pre-window text.
13. Edit on a `closed-won` deal → 0 emails, log row `skipped/stage_inactive`.

Regression sweep (re-run, expect green):
- Prompt 3 RTL 6/6
- Prompt 4 Deno 12/12
- SettingsMutationCard E2E
- Smart Status Note 30/30
- Pilot KPI tracking suite (unchanged)
- `newsletterSenderDetection` 10/10

## Open confirmations before I proceed

1. Append-only model mapping (above) — OK?
2. Subject = `"<Deal Name> Has Been Updated"` (no brackets) — OK?
3. Production deal URL host = `https://app.naitive.co/deals/...` — confirm or correct.
4. OK to add a nullable `profiles.preferences jsonb` (only if it doesn't already exist) for the mute preference.

Awaiting "approved" before any code, migration, deploy, or test send.

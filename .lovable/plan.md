
# Demo seeding overhaul

Make `seed-demo-account` work for any new demo user (not just `demo@5thline.co`), seed the new spec, tag all rows as demo, suppress all email/notification side effects during seeding, and show a one-time notification-consent modal on first login.

## 1. Database migration (one migration)

Add demo + seeding plumbing only where missing. All other affected tables (`contacts`, `crm_companies`) already have `tags text[]`.

- `deals.tags text[] default '{}'`
- `master_lenders.tags text[] default '{}'`
- `deal_lenders.tags text[] default '{}'`
- `tasks.tags text[] default '{}'` (lightweight column alongside the existing `task_tag_assignments` table; used purely as a marker)
- `companies.is_seeding boolean not null default false`
- `profiles.notifications_opted_in boolean not null default true` — demo accounts get `false` until they consent.
- `profiles.notifications_consent_shown boolean not null default false` — drives the one-time modal.

Notification trigger hook (cheapest viable form):

- Add a small SQL helper `public.suppress_company_notifications(_company_id uuid) returns boolean` that returns `true` if `companies.is_seeding = true` for that company.
- Update the existing `notify_email_on_lender_event` trigger and the existing `is_deal_notification_suppressed` helper used by deal/lender notification flows to also return early when `suppress_company_notifications(company_id)` is true.
- For per-user email sends, the edge functions that read `profiles.email_notifications` etc. will additionally honor `notifications_opted_in = false`.

We will NOT rewrite every notification trigger; the `is_seeding` flag plus `notifications_opted_in` cover the realistic notification surfaces (lender events, deal events, deal summary emails, task assignment emails).

## 2. `supabase/functions/seed-demo-account/index.ts` rewrite

Change to accept `{ email, password?, companyName? }` in the request body. Default to existing `demo@5thline.co` constants when not supplied so existing call sites keep working.

Sequence:

1. Validate input. Resolve or create the user via `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: {...} })`. Confirmed inline → no auth confirmation email.
2. Create or reuse a company named `companyName ?? "<Email> Demo"`. **Set `is_seeding = true` immediately** so all triggers fire as no-ops during the rest of the seed.
3. Upsert profile with `notifications_opted_in = false`, `notifications_consent_shown = false`, plus the existing notification-disable flags as a belt-and-suspenders measure.
4. Add user as `owner` in `company_members`. Apply `company_settings`, full `user_data_permissions`, and disabled `user_deal_summary_preferences` exactly as today.
5. Trim the 20-lender list to the **10 most varied** (mix of ABL, Venture Debt, Growth Capital, Revenue-Based, Senior Debt, Mezzanine; mix of Tier 1/2/3; mix of geos). Insert with `tags: ['demo']` and seed lender contacts + a small subset of lender notes.
6. Pick **4 deals** from the existing list, one per stage in {`initial-lender-review`, `terms-issued`, `in-due-diligence`, `proposal-issued`}. Insert with `tags: ['demo']`.
7. **`deal_lenders`**: each of the 4 deals gets 2–4 lenders drawn from the 10, with varied stages (`reviewing-drl`, `term-sheets`, `passed`, `management-call-completed`, `inquiry-sent`) and varied `tracking_status` (`active`, `on-deck`, `passed`). Insert with `tags: ['demo']`.
8. **Companies (25)**: insert into `crm_companies` with realistic mix across tech/logistics/consumer/healthcare/manufacturing, `tags: ['demo']`. **First 4 names match the 4 seeded deal companies** and back-fill `deals.crm_company_id` for those.
9. **Contacts (25)**: insert into `contacts` with realistic names/titles/`@demoXX.com` emails/phones, `primary_company_id` pointing at one of the 25 companies, `tags: ['demo']`. **At least 4 contacts** are linked to the 4 deals (set `tasks`/deal-association via the existing deal-contact link mechanism if a join table exists, otherwise via `deals.contact`/`contact_info` plus `crm_company_id`).
10. **Tasks (8–12)**: insert into `tasks` distributed across the 4 deals — mix of deal-level (`deal_id` set, `lender_id` null) and lender-level (`deal_id` + `lender_id`). All `assigned_to = userId`, `assigned_by = userId`, varied `due_date` (some 3–7 days overdue, some 1–2 weeks out), `tags: ['demo']`.
11. Keep existing milestone + activity-log seeding as-is, but add `tags: ['demo']` where columns exist.
12. **Unset `companies.is_seeding = false`** at the very end (in a `try/finally`-style guard so a partial failure doesn't leave the company stuck in seeding mode).
13. Response includes counts for all six entity types.

The hardcoded `DEMO_COMPANY_ID` in `src/lib/demoAccount.ts` remains for backward compatibility with the existing demo tenant; new demo accounts are still recognized as demo via the seeded `tags = ['demo']` and `notifications_opted_in = false` flags. No client-side gating change required for this work.

## 3. `seed-demo-data` legacy function

Add a comment + delegate-style note pointing at `seed-demo-account`. Update its insert payloads to also stamp `tags: ['demo']` on deals and `notes: 'demo'` on `deal_lenders` so the existing lightweight seeder also produces demo-tagged data. No structural rewrite — this function is the in-app "Re-seed demo data" button used by `DemoBanner`.

## 4. First-login notification consent modal

New file `src/components/notifications/NotificationConsentModal.tsx`:

- Reads the current `profiles.notifications_consent_shown` flag (via `useProfile` extension).
- Shows once when the flag is `false` AND the user is on `/deals` (mount-level effect inside the modal component, no router gating).
- Title: "Stay in the loop". Body: "Get email updates on deal activity, lender responses, and task reminders."
- Two buttons:
  - **Yes, notify me** → `profiles.notifications_opted_in = true`, `notifications_consent_shown = true`.
  - **Maybe later** → only `notifications_consent_shown = true`.
- Also writes `localStorage['naitive-notifications-consent-shown'] = '1'` as a fallback so it never re-appears even if the DB write transiently fails.

Mount the component inside `src/pages/Index.tsx` (or wherever `/deals` page lives — confirm during implementation) so it only renders for the deals route.

## 5. Acceptance criteria

- Calling `seed-demo-account` with a brand-new email creates the user with no confirmation email, no welcome email, no task-assignment emails, no deal-activity emails — verified by `supabase--edge_function_logs` showing no notification function invocations during the seeding window.
- `select count(*)` after seeding returns: 4 deals tagged demo, 10 lenders tagged demo, 25 contacts tagged demo, 25 crm_companies tagged demo, 8–12 tasks tagged demo, 8–16 deal_lenders tagged demo.
- At least 4 contacts and 4 crm_companies are linked to the 4 demo deals.
- After login, the consent modal appears once on `/deals`. Choosing either button prevents it from appearing again.
- The existing `demo@5thline.co` flow still works (no behavioral regression).

---

**If you approve this plan, the next step is the migration (one tool call), and then the edge-function rewrite + modal in a follow-up batch.**

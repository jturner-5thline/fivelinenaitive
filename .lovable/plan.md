
# Create Demo Access Flow — Implementation Plan

This is a large, multi-part feature spanning UI, database schema, edge functions, email infrastructure, and activity tracking. Before I start building, I want to confirm scope and surface a few important constraints I'd hit immediately.

## Scope summary

1. New "+ Create Demo Access" button + modal in Admin → Users (admin-only).
2. Backend creation of a company + user accounts + invite flow.
3. Branded HTML invite emails with signed tokens (7-day expiry, resendable).
4. Per-company "Activity" tab tracking sign-ins, page views, and feature usage.
5. New `user_activity_log` table with RLS.
6. Companies tab filter (All / Demo·Pilot / Client) and demo-company quick actions (View Activity, Extend Trial, Revoke Access).

## Important things to flag before building

These will materially shape implementation — I'd like your call on each:

**A. Existing schema reuse vs. new fields.** Your spec assumes columns that don't exist yet on `companies` (`type`, `notes`, `subscription_status`, `trial_ends_at`, `created_by`) and on `profiles` (`is_active`). I'll add them as nullable/with-defaults via idempotent migrations so nothing existing breaks. Confirm OK.

**B. Roles model.** This project already uses a separate `user_roles` table (per project memory). The form's "Admin / Member / Read Only" will write to `user_roles` (not to `profiles.role`), to stay consistent with the security model. The "Read Only" role is new — I'll add it to the `app_role` enum.

**C. Auth user creation.** `supabase.auth.admin.createUser` requires the service role key and must run inside an edge function (`create-demo-access`). The function will verify the caller is an admin via `has_role`.

**D. Invite email.** I'll use the existing Lovable Emails infrastructure (the project already has a transactional email setup). The invite goes through `send-transactional-email` with a new `demo-invite` template. The signed token is stored in a new `demo_invitations` table (token, user_id, company_id, expires_at, accepted_at). The `/accept-invite` route will validate the token, mark it accepted, and route the user to login/SSO.

**E. Activity tracking scope.** Logging "every page navigation, every AI query, every deal created, etc." across the entire app is a large cross-cutting change. I propose:
- Phase 1 (this build): create `user_activity_log` + RLS, add a small `logActivity()` helper, instrument `sign_in` (on auth state change) + `page_view` (one global hook in `AppLayout`). Surface in the Activity tab.
- Phase 2 (follow-up): instrument feature events (deal created, email drafted, lender searched, AI queried). I'll list the call sites and we tackle them in a focused follow-up so this PR doesn't sprawl across 30+ files.

**F. Admin gating.** Only users with `admin` role (via `useAdminRole`) see the button and the Activity tab. The edge function double-checks server-side.

## File-level plan

### Migrations (single migration, idempotent)
- `companies`: add `type text`, `notes text`, `subscription_status text default 'active'`, `trial_ends_at timestamptz`, `created_by uuid`.
- `profiles`: add `is_active boolean default true`.
- `app_role` enum: add `'read_only'` if missing.
- New table `demo_invitations` (id, user_id, company_id, email, token, role, expires_at, accepted_at, sent_at, created_by) + RLS (admin read/write all; recipient can read own by token via edge function).
- New table `user_activity_log` (id, user_id, company_id, event_type, event_data jsonb, created_at) + indexes on (company_id, created_at desc) and (user_id, created_at desc) + RLS (admin reads all; user reads own; insert via service role from edge function or authenticated user inserting their own row).

### Edge functions
- `create-demo-access` — verifies admin, creates company, loops users (creates auth user if new, upserts profile, assigns role, creates invite token, calls `send-transactional-email`).
- `accept-demo-invite` — validates token, marks accepted, returns email to pre-fill.
- `resend-demo-invite` — admin-only, regenerates token, resends email.
- `revoke-demo-access` — admin-only, sets `profiles.is_active = false` for all users in the company.
- `extend-demo-trial` — admin-only, updates `companies.trial_ends_at`.
- `log-user-activity` — thin authenticated insert wrapper (or do it via direct supabase insert with RLS — leaning direct insert).

### Email template
- New `_shared/transactional-email-templates/demo-invite.tsx` with naitive branding (dark background, logo, CTA), registered in `registry.ts`.

### Frontend
- `src/components/admin/CreateDemoAccessModal.tsx` — the form.
- `src/components/admin/DemoCompaniesTab.tsx` (or extend existing Companies tab) — filter toggle + quick actions.
- `src/components/admin/CompanyActivityView.tsx` — Activity tab content.
- `src/pages/AcceptInvite.tsx` + route.
- `src/hooks/useActivityLogger.ts` — `logActivity(event_type, event_data)`.
- Wire `page_view` logging in `AppLayout` and `sign_in` logging in `AuthContext`.
- Add the `+ Create Demo Access` button to the existing admin Users section header (admin-only).

### Out of scope for this PR (proposed Phase 2)
- Instrumenting individual feature events (deal created, email drafted, lender searched, AI queried) at every call site.

## Question for you before I start

The single biggest scope decision: **are you OK with Phase 1 activity tracking (sign-ins + page views only) shipping now, with feature-event instrumentation as a focused follow-up?** Otherwise this PR will touch 30+ files across deals/email/lenders/AI surfaces and become very hard to review safely.

If you say "yes, Phase 1 now," I'll proceed end-to-end. If you say "do it all," I'll proceed but expect a much larger diff.

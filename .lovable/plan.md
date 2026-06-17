# Demo Inbox Auto-Seeding

Every account created through Create Demo (and the canonical TEMPLATE workspace) ships with a populated, internally-consistent fake inbox. No real Gmail/Microsoft connection required. Idempotent, clearly tagged as demo, and visible as "Demo Inbox Active" instead of "Connect your email."

## What gets built

### 1. Schema (migration)

Mark seeded mailbox rows so they can be wiped/refreshed without touching real mail:

- `gmail_messages`: add `is_demo_seed boolean default false`, `seed_key text` (deterministic), unique index `(user_id, seed_key) where seed_key is not null`.
- `gmail_tokens`: add `is_demo_seed boolean default false`.
- `email_threads`: add `is_demo_seed boolean default false`, `seed_key text`, unique index `(user_id, seed_key) where seed_key is not null`.
- `companies.is_demo` already exists — reused as the canonical "this is a demo tenant" flag (set to `true` by `seed-demo-account`).

### 2. New seeder module

`supabase/functions/_shared/seedDemoInbox.ts` exporting `seedDemoInbox(admin, { userId, userEmail, companyId, contacts, deals, tasks, calendarEvents })`.

Generates ~14 threads / ~32 messages drawn from a fixed scenario library and stamped with deterministic `seed_key`s like `demo-inbox/<scenario>/<index>`:

- Client-side threads tied to seeded **contacts + companies** (CFO sending Q4 financials, founder confirming data-room access, lawyer sending NDA redline).
- Lender-side threads tied to seeded **deals + lenders** (term sheet from Greenfield Capital, IOI from Apex Venture Lending, pass note from Ironclad, follow-up Q&A from Bridgeport).
- Internal threads tied to seeded **tasks** (deal team @mentions on outstanding items, status updates).
- Calendar threads tied to seeded **calendar_events** (meeting confirmations, reschedules, agenda follow-ups).
- Realistic mix of read/unread/starred, INBOX/SENT/IMPORTANT labels, snippets, plain-text + HTML bodies, attachments (referenced by filename only, no storage object), and timestamps spread across the last 14 days with two pinned-fresh threads (4–7 min ago) so the inbox feels live.

All rows insert with `ON CONFLICT (user_id, seed_key) DO UPDATE` → reprovision/repair never duplicates.

`email_threads` rows mirror the messages with the same `seed_key` pattern so the threaded inbox view groups correctly.

### 3. "Connected" sentinel per demo user

`seedDemoInbox` also upserts one `gmail_tokens` row per demo user:

```
user_id, email_address = <demo email>, grant_id = 'demo-seed',
account_id = 'demo-seed', scope = 'demo-seed',
expires_at = now() + 10 years, is_demo_seed = true
```

### 4. Edge function wiring

- `supabase/functions/seed-demo-account/index.ts`: after the existing contacts/deals/tasks/calendar seeding, sets `companies.is_demo = true`, then calls `seedDemoInbox(...)`. Returns `inboxSeed: { threads, messages }` counts in the response.
- `supabase/functions/repair-demo-tenant/index.ts`: re-runs `seedDemoInbox` (idempotent) so Repair refreshes the inbox.
- `supabase/functions/gmail-status/index.ts`: short-circuit branch — if the loaded `gmail_tokens` row has `grant_id = 'demo-seed'` (or `is_demo_seed = true`), respond `{ connected: true, provider: 'gmail', email_address, connected_at, source: 'demo-seed' }` and skip the Nylas grant verify call.

### 5. Frontend

- `src/hooks/useGmail.ts`:
  - Replace the hardcoded `isDemoUser = email === 'demo@5thline.co'` check with `isDemoUser = gmailStatus.source === 'demo-seed'` (derived from the new `gmail-status` field) **plus** the existing email allowlist as fallback.
  - When the demo-seed sentinel is detected, read messages from the real `gmail_messages` table (RLS already scopes to `user_id`) instead of the hardcoded `DEMO_MOCK_EMAILS` constant. The existing two pinned mock emails for `demo@5thline.co` stay only as a fallback if the table is empty.
- `src/components/integrations/GmailIntegration.tsx` and the inbox empty-state in `src/pages/EmailIntelligencePage.tsx`: when `status.connected && status.source === 'demo-seed'`, render a "Demo Inbox Active" pill (green dot + tooltip "Seeded demo mailbox — not a real Google/Microsoft connection") and suppress the "Connect your email" CTA / empty state.

### 6. Counts per demo tenant (deterministic)

- 14 threads, 32 messages
- 8 unread, 4 starred
- ~18 messages linked to 6 seeded contacts (8 distinct sender domains)
- ~10 messages linked to 5 seeded deals + 5 seeded lenders
- ~4 messages linked to seeded tasks / calendar events
- 2 pinned threads (4 min + 7 min ago) so first load feels live

## Technical notes

- Idempotency: every insert uses `seed_key` + `ON CONFLICT DO UPDATE`. Re-running `seed-demo-account` or `repair-demo-tenant` updates rows in place — no duplicates.
- Safety: `is_demo_seed = true` on every seeded row means demo data can never be confused with real synced mail. Real Nylas/Microsoft sync paths ignore rows where `is_demo_seed = true`.
- Performance: bulk-inserts in a single `.insert([...])` per table. Inbox load is a normal indexed `SELECT … FROM gmail_messages WHERE user_id = $1 ORDER BY received_at DESC LIMIT 50` — no network round-trip to Nylas.
- Send: a follow-up `POST` to send mail will still fail (no provider). Out of scope for this change — Mail appears connected for read; send remains disabled with a small "Demo inbox is read-only" note on the composer.

## Files changed

- `supabase/migrations/<new>.sql` (schema)
- `supabase/functions/_shared/seedDemoInbox.ts` (new)
- `supabase/functions/seed-demo-account/index.ts`
- `supabase/functions/repair-demo-tenant/index.ts`
- `supabase/functions/gmail-status/index.ts`
- `src/hooks/useGmail.ts`
- `src/components/integrations/GmailIntegration.tsx`
- `src/pages/EmailIntelligencePage.tsx`

## Returned to caller

After `seed-demo-account` finishes, the response includes:

```json
{
  "inboxSeed": { "threads": 14, "messages": 32, "linkedContacts": 6,
                 "linkedDeals": 5, "linkedLenders": 5, "linkedTasks": 3,
                 "linkedCalendarEvents": 2 }
}
```

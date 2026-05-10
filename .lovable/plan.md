## Goal
Surface Microsoft emails + calendar in the same UI as Gmail/Google Calendar via unified tables, without modifying Gmail code.

## 1. Unified DB schema (new migration)
Create two new tables (Gmail keeps writing to `gmail_messages` — we will NOT touch it):

- `public.emails` — provider-agnostic message store
  - `id`, `user_id`, `provider` (gmail|microsoft), `message_id`, `thread_id`,
    `subject`, `from_email`, `from_name`, `to_emails text[]`,
    `preview text`, `received_at`, `is_read bool`, `has_attachments bool`,
    `created_at`, `updated_at`
  - Unique `(user_id, provider, message_id)`
  - RLS: users select own; service role full

- `public.calendar_events` — provider-agnostic event store
  - `id`, `user_id`, `provider`, `event_id`, `title`,
    `start_time`, `end_time`, `organizer_email`, `attendees text[]`,
    `location`, `meeting_url`, `is_all_day`, `is_cancelled`,
    `created_at`, `updated_at`
  - Unique `(user_id, provider, event_id)`
  - RLS: users select own; service role full

- Keep `ms_synced_emails` / `ms_synced_calendar_events` for now (no breakage); remove later.

## 2. Repoint Microsoft sync edge functions
- `microsoft-sync-emails`: upsert into `public.emails` with `provider='microsoft'` (instead of `ms_synced_emails`).
- `microsoft-sync-calendar`: upsert into `public.calendar_events` (instead of `ms_synced_calendar_events`), mapping `organizer.emailAddress.address` → `organizer_email`, attendee addresses → `attendees text[]`, `onlineMeeting.joinUrl` when `isOnlineMeeting` → `meeting_url`.
- Add 429 backoff: respect `Retry-After`, retry once, then defer to next cron.

## 3. InboxDialog: show Microsoft alongside Gmail
The existing inbox uses the `gmail-messages` edge function (live Gmail API), not a DB table. To respect "do NOT change Gmail":
- Extend `inboxCacheStore` with a parallel fetch from `public.emails WHERE provider='microsoft'` (via supabase-js, RLS-scoped).
- Merge Microsoft rows into the same in-memory inbox/sent lists, sorted by `received_at desc`.
- Add a `provider` field to the cached message shape; render an Outlook icon badge in `InboxDialog` rows when `provider==='microsoft'`.

## 4. Calendar surface
- The project has no Google calendar events table; calendar UIs read live. To deliver visible value now, render upcoming Microsoft events inside the Microsoft card on `/integrations` (small list with provider icon, time, title). A full unified calendar view in the AI Calendar surface can come in a follow-up — flag this so the user can confirm.

## 5. Cron
Already scheduled (5min email / 15min calendar) in the previous pass. No changes.

## Out of scope / explicit non-goals
- Migrating Gmail to write into `public.emails` (would violate "do NOT change Gmail").
- Full body fetch / search action additions on `microsoft-auth` — not required for the inbox merge; can add if requested.
- Vault encryption of access tokens (current schema stores plaintext like Gmail; tracked as a separate hardening task).

## Files touched
- new migration: create `emails`, `calendar_events` + RLS
- `supabase/functions/microsoft-sync-emails/index.ts`
- `supabase/functions/microsoft-sync-calendar/index.ts`
- `src/stores/inboxCacheStore.ts`
- `src/components/dashboard/InboxDialog.tsx` (provider icon badge)
- `src/pages/Integrations.tsx` (Microsoft card upcoming-events preview)

# Diagnosis: Why opening an email is slow

## Root cause

For Gmail/Nylas users, opening a message ALWAYS makes a live round-trip to Nylas — there is no DB cache, no prefetch-to-DB, and no read-through. Microsoft users are already served from `emails.raw` (instant), which is why the bug is Gmail-specific.

### Call chain

1. `src/components/deal/email/useFullEmailMessage.ts:292–304` — `fetchFullEmailMessage()` calls `supabase.functions.invoke('gmail-messages', { action: 'get', message_id })` wrapped in `withTimeout(..., 15_000)` (line 213 `FETCH_TIMEOUT_MS = 15_000`). This is the 15s ceiling that produces the user-visible "gmail-messages get timed out after 15000ms".
2. `supabase/functions/gmail-messages/index.ts:663–766` — the `case "get"` handler unconditionally does `fetch(${baseUrl}/messages/${message_id})` against Nylas (line 674). There is no `email_cache` / `emails.raw` lookup before the network call and nothing is written back after.
3. `index.ts:360–408` — the Microsoft branch DOES read from `public.emails` (`select … raw … .eq(message_id)`) and never calls Graph live. That path is consistently fast; only Gmail/Nylas opens hang.
4. There is no body field in either cache table:
   - `public.emails` has `raw jsonb` — populated by Microsoft sync, empty for Gmail.
   - `public.email_cache` has `body_text` only — no `body_html`, no inline-attachment metadata, and the `get` handler never reads or writes it.
5. The `list` action (`index.ts:482–660`) fetches only message headers (no `body`) from Nylas, so even with healthy syncs the body is fetched lazily on first open every time, every user, every device.
6. Nylas message-detail latency: typical 800ms–4s, spikes >15s on large mailboxes (we already have a 25s timeout on `list` at line 528 acknowledging this). With no cache, every spike → user-visible timeout + Retry.

There is no N+1 here — it's a single call — but it's a SYNCHRONOUS, UNCACHED call to a slow provider on the user's critical render path.

## Fix (no changes yet — for approval)

Goal: first open is at most one Nylas round-trip; every subsequent open across devices/sessions is instant from Postgres.

### 1. Persist Gmail/Nylas bodies in Postgres

Add columns to `public.email_cache` (and ensure parity with what the `get` handler returns):

```
ALTER TABLE public.email_cache
  ADD COLUMN body_html        text,
  ADD COLUMN attachments      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN inline_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN provider         text NOT NULL DEFAULT 'gmail',
  ADD COLUMN body_fetched_at  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS email_cache_user_msg_uidx
  ON public.email_cache (user_id, gmail_message_id);

CREATE INDEX IF NOT EXISTS email_cache_user_thread_idx
  ON public.email_cache (user_id, thread_id);
```

(`gmail_message_id` is the existing column; we'll reuse it as the provider message id for Nylas regardless of upstream provider.)

### 2. Cache-first read in `gmail-messages` `get` handler

`supabase/functions/gmail-messages/index.ts:663–766` — wrap the existing Nylas fetch:

```text
case "get":
  1. SELECT body_html, body_text, attachments, inline_attachments, …
       FROM email_cache
       WHERE user_id=? AND gmail_message_id=?
       AND body_fetched_at IS NOT NULL
  2. If hit → return immediately (no Nylas call). Kick off a
     background revalidation only if body_fetched_at is older than 24h
     using EdgeRuntime.waitUntil(...).
  3. If miss → existing Nylas fetch (line 674), then UPSERT the full
     normalized message into email_cache before returning.
```

Same pattern for the Microsoft branch at `index.ts:360–408` — already DB-backed, no change needed.

### 3. Backfill on `list` / sync, so the very first open is also instant

- `gmail-sync` / `nylas-sync-emails` (whichever sync job populates `email_cache` today — they currently store headers only): on sync, for the top N most-recent messages (e.g. last 50 per folder) fetch `/messages/{id}` in a bounded-concurrency pool (max 5) and upsert bodies. This makes the inbox feel instant from cold load.
- Add a lightweight `prefetch` action on `gmail-messages` that takes `message_ids[]`, fetches in parallel (concurrency 5), and writes to `email_cache`. The client already calls `prefetchFullEmailMessage` on hover/render (`useFullEmailMessage.ts:254`) — change it to call this batch action instead of N individual `get` invocations.

### 4. Tighten the client timeout once cache-first is live

`src/components/deal/email/useFullEmailMessage.ts:213` — drop `FETCH_TIMEOUT_MS` from 15s to 5s. With cache hits the edge function returns in <200ms; the 15s ceiling only existed to ride out cold Nylas calls, which are now off the critical path.

### 5. Verification

- DB: after fix, `SELECT count(*) FROM email_cache WHERE body_html IS NOT NULL` grows on every inbox open.
- Network tab: second open of the same email shows `gmail-messages` returning in <300ms.
- Edge function logs: cache-hit log line dominates; live Nylas calls only on first open per message.
- The "Couldn't load this message" toast no longer fires on slow networks because retry has a body to fall back to.

## Files / lines summary

| Concern | File | Lines |
| --- | --- | --- |
| 15s client timeout | `src/components/deal/email/useFullEmailMessage.ts` | 213, 297–304 |
| Gmail get = live Nylas, no cache | `supabase/functions/gmail-messages/index.ts` | 663–766 (esp. 674) |
| Microsoft get already DB-backed (reference) | `supabase/functions/gmail-messages/index.ts` | 360–408 |
| List fetches headers only | `supabase/functions/gmail-messages/index.ts` | 482–660 |
| Cache table missing body_html | `public.email_cache` schema | — |

No behavior change for Microsoft users. Gmail/Nylas users get instant opens after the first fetch and a one-time backfill.

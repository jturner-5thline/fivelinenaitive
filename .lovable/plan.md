# Diagnosis: Inbox only shows ~24h of email

## Where the inbox gets its data

The mail modal on `/deals` is `InboxDialog` (lazy-loaded from `src/components/deals/DealsHeader.tsx:40,488`). Both first-page and pagination calls go through `supabase.functions.invoke('gmail-messages', { action: 'list', label_ids: ['INBOX'], ... })`:

- Prefetch: `src/stores/inboxCacheStore.ts` `fetchPage()` (≈ line 145) — `PAGE_SIZE = 100`, no time filter
- Dialog pagination: `src/components/dashboard/InboxDialog.tsx` `fetchPage()` (line 150) and `autoPaginate()` (line 416) — `AUTO_LOAD_CAP = 1000`, no time filter
- Cache backfill: `loadOlderFromCache()` (line 390) reads `email_cache` ordered by `received_at desc` with no `gte`/`lt` floor

## Where the time window is actually imposed

The edge function `supabase/functions/gmail-messages/index.ts` branches on the user's connected provider (line 445‑458). It does **not** add any time filter on either branch.

### Microsoft (Outlook) branch — this is the bug

`handleMicrosoftAction` (lines 295‑341) reads from the `emails` table — it does not query Graph live. That table is populated by `microsoft-sync-emails`.

`supabase/functions/microsoft-sync-emails/index.ts` line **70**:

```
"https://graph.microsoft.com/v1.0/me/messages?$select=...&$orderby=receivedDateTime desc&$top=50"
```

The Graph URL is hard-capped to `$top=50`, with no `$skip` / `@odata.nextLink` follow, no historical backfill, and no per-user "last_synced_message_id" cursor. Every sync run replaces the working set with at most the 50 most recent messages, so the inbox ends up showing roughly the last day (the exact window depends on email volume, but for an active mailbox 50 messages ≈ < 24h).

Additionally, `gmail-messages` Microsoft list path (lines 309‑315) caps results at `Math.min(max_results || 50, 200)` — even if the table had more, the UI would only get up to 200 per page. The dialog never pages this branch because `next_page_token` is hard-coded to `null` (line 340).

### Gmail / Nylas branch — clean, no 24h cap

Lines 466‑514 forward to Nylas `/messages` with `limit`, `page_token`, optional `search_query_native`, and `in=INBOX`. No `after:` / `newer_than:` is added. `AUTO_LOAD_CAP=1000` in `InboxDialog` is the only ceiling. So Gmail-connected users are not affected; this matters only for the Microsoft 365 connection.

## Proposed fix (no edits yet)

Two changes, scoped to the Microsoft path so Gmail behavior is unchanged:

1. **Backfill + incremental sync in `supabase/functions/microsoft-sync-emails/index.ts`**
   - Replace the fixed `$top=50` URL (line 70) with a paged loop that follows `@odata.nextLink` until either (a) a configurable historical floor is reached (default: 365 days, via `$filter=receivedDateTime ge {iso}`) or (b) a `last_synced_message_id` from `microsoft_tokens` is encountered on first page (delta cursor).
   - Use `$top=100` per page (Graph max ≈ 1000 but 100 is the sweet spot for memory + rate limits), upsert in batches, and store a `last_email_sync_cursor` on `microsoft_tokens` so subsequent runs only fetch new mail.
   - Add a one-time backfill flag (`initial_backfill_done` on `microsoft_tokens`) so the first run pulls the historical window, then steady-state runs are tiny deltas.

2. **Lift the Microsoft list cap and add pagination in `supabase/functions/gmail-messages/index.ts`**
   - In `handleMicrosoftAction` (lines 297‑341), keep `max_results` honored but support `page_token` by switching to keyset pagination on `received_at` (use `.lt('received_at', cursor)`), and return a `next_page_token` (the oldest `received_at` of the returned page) instead of hard-coding `null` (line 340). This lets `InboxDialog.autoPaginate` and the cache‑backed "load older" path drain the full `emails` table the same way they do for Gmail.

3. **(Optional, after #1/#2) trigger an immediate backfill** for already-connected Microsoft users by clearing `initial_backfill_done` once, or by exposing a "Resync history" button next to "Sync now" in `src/pages/Integrations.tsx` (lines 391‑402). No client-side time math needs to change.

## Verification plan

- DB: `select min(received_at), max(received_at), count(*) from emails where user_id = … and provider='microsoft';` before and after the first run of the patched sync should show the window expanding from ~1 day to the configured floor (e.g., 365 days).
- UI: open the mail modal on `/deals`, scroll past the first page; `InboxDialog.autoPaginate` should successfully fetch additional pages for a Microsoft account (today it bails because `next_page_token` is always `null`).
- Gmail accounts: confirm no regression — the Nylas branch is untouched.

## Files / lines to change

- `supabase/functions/microsoft-sync-emails/index.ts` line **70** (and the `syncForUser` function around lines 62‑117): paged Graph fetch + cursor.
- `supabase/functions/gmail-messages/index.ts` lines **297‑341**: respect `page_token`, return real `next_page_token`, drop the `Math.min(..., 200)` hard ceiling or raise to `1000`.
- `microsoft_tokens` table: add `last_email_sync_cursor text` and `initial_backfill_done boolean default false` (new migration).
- (Optional UI) `src/pages/Integrations.tsx` lines 391‑402: add "Resync history" action.


## Root cause

The inbox is calling the `gmail-messages` `get` action with the **`email_cache.id` row UUID** instead of the **Nylas provider id** (`gmail_message_id`). Nylas 404s on the UUID, the edge function returns `{ message: null, not_found: true }`, and the viewer falls back to the snippet + Retry.

### Evidence chain

1. **Symptom UUID is an `email_cache` PK.** Console: `[link-deal hydrate] timeout` and `[email.load_failed]` for `messageId="cb140867-615e-4799-826a-196f6facda37"`. A direct DB lookup confirms:
   - `email_cache.id = cb140867-615e-4799-826a-196f6facda37`
   - `email_cache.gmail_message_id = 19eae400c6b1bd4a` (real Nylas id)
   - `subject = "Re: Gabb Wireless Financial Model"` — exactly the user's thread.

2. **The inbox spreads the cache row, so `email.id` becomes the UUID.** `src/hooks/useEmailIntelligence.ts:340-348` (`loadEnrichedEmails`) builds `EnrichedEmail` via `{ ...(c as CachedEmail), analysis }`. `CachedEmail.id` is the table PK (UUID), and `CachedEmail.gmail_message_id` is the provider id — distinct fields. Downstream the inbox treats `email.id` as the message id and passes it to `fetchFullEmailMessage(messageId)` in `src/components/deal/email/useFullEmailMessage.ts:297-309`.

3. **Edge function `case "get"` cannot recover from this.** `supabase/functions/gmail-messages/index.ts:680-690` filters by `.eq("gmail_message_id", message_id)` so a UUID never matches a row. Falls through to `fetch(${baseUrl}/messages/${UUID})` (line 769). Nylas returns 404. Lines 786-794 return `{ message: null, not_found: true }`. Client throws `"Message could not be loaded"` (`useFullEmailMessage.ts:335-337`), which the viewer renders as **"Full message unavailable"** at `src/components/deal/email/EmailListAndDetail.tsx:1772-1781` (`!resolvedHtml && !hasRenderableBody` branch).

4. **Cache-first never hits for the broken path.** `email_cache` has 8,120 rows; only **2** have `body_fetched_at IS NOT NULL`. Every other open is forced to live Nylas. With the wrong id it can never succeed; with the right id it does, but the cache is essentially cold.

5. **The two "succeed" rows** (`body_fetched_at` set) are the only paths that pass the proper hex `gmail_message_id` — confirming that when the id is correct the new cache-first code works; the problem is the id, not the body parser, not Nylas auth, not grant expiry.

### What this rules out

- Not a missing-body / NULL-`body_html` cache-hit bug — cache `select` filters those out via `.not('body_fetched_at','is',null)`.
- Not silent Nylas success-with-empty-body — Nylas never gets called with a real id on the broken path.
- Not a sync gap — bodies aren't backfilled, but that's a secondary issue (slow first open). The user-visible failure is the 404 caused by the id.
- Not rate-limit (only 429s seen are on `list`, not `get`).

## Fix (no changes yet — for approval)

Two-part, smallest-blast-radius first.

### A. Make the inbox pass the provider id (primary fix)

`src/hooks/useEmailIntelligence.ts:339-349` (`loadEnrichedEmails`) — when building `EnrichedEmail`, set the consumer-facing `id` to the provider id:

```text
enriched.push({
  ...(c as CachedEmail),
  id: c.gmail_message_id ?? c.id, // <- public id used by the inbox / get handler
  row_id: c.id,                   // keep PK for analysis joins / unlink
  analysis: analysisMap.get(c.id) as EmailAnalysis | undefined,
});
```

Audit and update callers that previously joined analysis by `email.id` to use `email.row_id` instead. Specifically:
- `email_analysis.email_cache_id` join in `useEmailIntelligence.ts:311-321, 411-440` (use `row_id`).
- `unlinkEmail`, deal-email linking, `useEmailIntelligence` realtime subscription (`useEmailIntelligence.ts:490-499`).
- Any inbox component that keys list rows by `email.id` — keying by provider id is correct and will fix the click-through.

### B. Defense-in-depth: make the edge function tolerant of either id

`supabase/functions/gmail-messages/index.ts:680-769` — before/inside the cache lookup, if `message_id` is UUID-shaped (regex `/^[0-9a-f]{8}-[0-9a-f]{4}-/`), resolve to the real provider id first:

```text
if (isUuid(message_id)) {
  const { data: row } = await supabase
    .from('email_cache')
    .select('gmail_message_id')
    .eq('user_id', user.id)
    .eq('id', message_id)
    .maybeSingle();
  if (row?.gmail_message_id) message_id = row.gmail_message_id;
}
```

This unblocks any other surface that still passes the UUID and is cheap (single index lookup).

### C. Backfill bodies opportunistically (secondary, separate follow-up)

With (A) fixed, every first open is still a live Nylas round-trip because only 2 rows have `body_fetched_at`. Add a bounded-concurrency backfill action (`action: "prefetch", message_ids: [...]`) and have the inbox call it for the visible page after `list`. Out of scope for this hotfix but worth queueing.

## Files / lines

| Concern | File | Lines |
| --- | --- | --- |
| Spreads cache PK as `email.id` | `src/hooks/useEmailIntelligence.ts` | 339–349 (and analysis joins 311–321, 411–440, realtime 490–499) |
| Calls `get` with whatever `email.id` is | `src/components/deal/email/useFullEmailMessage.ts` | 297–309 |
| Cache lookup uses provider id | `supabase/functions/gmail-messages/index.ts` | 680–690 |
| Nylas live fetch with the (wrong) id → 404 | `supabase/functions/gmail-messages/index.ts` | 768–794 |
| Renders "Full message unavailable" on no body | `src/components/deal/email/EmailListAndDetail.tsx` | 1772–1781 |

### Verification after fix

- Open the Gabb Wireless thread → cache miss → Nylas live → 200 with body → upsert with `body_fetched_at` → second open <300ms.
- DB: `SELECT count(*) FROM email_cache WHERE body_fetched_at IS NOT NULL` climbs as users browse.
- Edge logs: `[gmail-messages:get] attachment-debug` lines appear (currently absent — proving `get` never reaches body parsing today).
- "Full message unavailable" no longer fires for healthy mailboxes.

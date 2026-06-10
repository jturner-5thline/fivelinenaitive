## What's actually happening

Matt's inbound messages **are** in the search result set. They are not hidden by the query — they are hidden by how each row is rendered.

### Root cause (primary): row label always shows the *thread's* newest sender, not the *row's* sender

`src/components/deal/email/EmailListAndDetail.tsx`

1. `threads` (lines **948–983**) builds **one row per message** (`threadId: msg.id`, `latestEmail: msg`), but attaches the **entire conversation** to each row via `emails: convoEmails`.
2. `ThreadListItemImpl` (lines **294–313**) then computes the row's visible sender from the newest message in the *whole conversation*, not from this row's message:
   ```ts
   const newestInThread = [...thread.emails].sort(... newest first)[0];
   const newestIsOutbound = newestInThread.folder === 'sent' || newestInThread.from_name === 'You';
   const displayName = newestIsOutbound ? 'Me' : newestInThread.from_name;
   const previewSnippet = newestInThread.snippet || newestInThread.body_preview || ...;
   ```
   Every row in a Matt↔Niki thread therefore renders sender = **Niki (the latest replier)** and the **same preview snippet from Niki's latest reply**, even the rows that actually represent Matt's inbound messages. To the user this looks like "only Niki's emails, repeated multiple times."

This is also why the open thread proves Matt sent mail — the underlying message is in `convoEmails`; the list view just relabels every row with the newest sender.

### Contributing cause #2: local substring filter is sender-only

`src/components/deal/DealEmailsTab.tsx` lines **945–960**:

```ts
} else if (searchQuery.trim()) {
  const q = searchQuery.toLowerCase();
  const allMailHitIds = new Set(allMailSearch.results.map((e) => e.id));
  filtered = filtered.filter((e) => {
    if (allMailHitIds.has(e.id)) return true;
    return (
      e.subject.toLowerCase().includes(q) ||
      e.from_name.toLowerCase().includes(q) ||
      e.from_email.toLowerCase().includes(q) ||
      e.snippet.toLowerCase().includes(q)
    );
  });
}
```

Recipients (`to_name`, `to_email`), CC, and body are **never matched**. A locally-loaded inbound message from Matt only survives the filter when Matt's stored `from_name` literally contains both words "matt rich". If Matt's Gmail display name is just "Matt" / "Matt R." / the bare email, the substring fails and the row is dropped.

### Contributing cause #3: Gmail all-mail search uses AND-tokenization

`src/hooks/useGmailAllMailSearch.ts` (lines 67–72, 145–153) forwards the raw query to `gmail-messages` as `search_query_native` (`supabase/functions/gmail-messages/index.ts` lines **483–516**). Gmail tokenizes `Matt Rich` as `Matt AND Rich` across indexed fields. Niki's outbound mail has both tokens (To: header `"Matt Rich" <matt.rich@gabb.com>` plus her signature) and matches. Matt's outbound display name in his own account often isn't "Matt Rich", so messages he sends may not contain both tokens in headers and won't match — they only return when "Rich" also appears in the body. Even when they do return, cause #1 still labels their row as "Niki".

### Not the cause
- No folder filter excluding inbound (`search_all_mail: true` drops `in=INBOX`, lines 491–516 of `gmail-messages/index.ts`).
- No deal/label filter — `isSearching` bypasses the sidebar/deal filter (`DealEmailsTab.tsx` line 841: `if (isSearching) ...`).
- No tsvector — server search is Gmail's native index; local search is `String.includes`.
- Thread de-dup is **not** what's collapsing rows — rows are per-message. The bug is that per-message rows borrow the *thread's* newest sender for display.

## Proposed fix

### 1. Render rows by their own message, not the thread's newest (primary fix)

In `src/components/deal/email/EmailListAndDetail.tsx` (~lines 294–313), drive `displayName` / `previewSnippet` from `latest` (the row's message) instead of `newestInThread`. Keep the "newest" lookup only for the unsearched inbox-collapsed mode if we still want it; the cleanest fix is:

```ts
const displayName = latest.folder === 'sent' || latest.from_name === 'You'
  ? 'Me'
  : latest.from_name;
const previewSnippet = latest.snippet || latest.body_preview || latest.body_text || '';
```

This restores per-message identity in the list, so Matt's inbound rows show "Matt Rich" + his snippet, and Niki's outbound rows show "Me" + her snippet — exactly like Gmail's All Mail view, which the surrounding comment already claims to emulate.

### 2. Broaden the local substring filter

In `src/components/deal/DealEmailsTab.tsx` lines 952–960:

- Add `to_name`, `to_email`, `body_preview`, `body_text` to the OR.
- Tokenize the query on whitespace and require all tokens (AND-of-substring) across the combined haystack — so `"Matt Rich"` matches a row where "Matt" is in `from_name` and "Rich" is anywhere in body/recipients.

### 3. Broaden Gmail's server-side query for short name-like queries

In `useGmailAllMailSearch.ts` `scopeQuery`, when the trimmed query is 1–3 words and has no Gmail operator, expand it to:

```
("Matt Rich" OR from:"Matt Rich" OR to:"Matt Rich")
```

This guarantees inbound mail from Matt is returned even when his display name in his own account isn't "Matt Rich".

### 4. (Optional) Surface the matching participant on the row

When `searchQuery` is active, render a small "matched: Matt Rich" chip on rows whose match comes from a non-sender field, so the user can tell *why* a row appeared.

## Verification plan

- Search "Matt Rich" in the inbox on `/deals`:
  - Rows where Matt is the sender show "Matt Rich" and his preview.
  - Rows where Niki is the sender show "Me" and Niki's preview.
  - No row mislabels Matt's inbound message as Niki's.
- Search "matt.rich@gabb.com" — same behavior.
- Search a body-only term ("Gabb Wireless Financial Model") — locally-loaded inbox rows now match via body, not just snippet.

## Files to touch

- `src/components/deal/email/EmailListAndDetail.tsx` (lines ~294–313) — switch display to per-row message
- `src/components/deal/DealEmailsTab.tsx` (lines 945–960) — broaden local filter + tokenize
- `src/hooks/useGmailAllMailSearch.ts` (lines 67–72) — expand short name queries to from/to OR

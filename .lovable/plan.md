## What's actually happening

Clicking a specific row opens the thread, but the detail pane doesn't know *which* message the user picked — so it expands the conversation's newest message and never scrolls anywhere. Multiple pieces are involved.

### Cause 1 — Row click drops the message id (primary)

`src/components/deal/DealEmailsTab.tsx` lines **1270–1286**:

```ts
const handleSelectThread = useCallback((thread: EmailThread) => {
  setSelectedThread(thread);
  setComposeOpen(false);
  if (thread.hasUnread) { … mark read … }
}, …);
```

It only sets `selectedThread`. It **never sets `deepLinkTarget`**, even though `thread.latestEmail.id` *is* the clicked message id (rows are per-message — `EmailListAndDetail.tsx` lines 948–983 build one `EmailThread` per message with `threadId: msg.id`, `latestEmail: msg`).

`deepLinkTarget` is set only by priority-signal navigation (`DealEmailsTab.tsx` line 411). Because of that, the entire auto-expand + auto-scroll pipeline downstream never fires on a normal click.

### Cause 2 — Expand-by-default keys off `thread.latestEmail.id`, not the clicked id

`src/components/deal/email/EmailListAndDetail.tsx` lines **3454–3490**:

```ts
const chronological = [...thread.emails].reverse();   // oldest → newest
const newestId = thread.latestEmail.id;
…
<ThreadMessage
  defaultExpanded={
    email.id === newestId
    || userExpandedMessages.has(email.id)
    || (!!deepLinkMessageId && email.id === deepLinkMessageId)
  }
/>
```

`currentThread.latestEmail` is overwritten with the clicked message at `DealEmailsTab.tsx:1095` (`latestEmail: liveMsg`), so in theory `newestId === clicked id`. That works **only when the clicked message is also present in `currentThread.emails`** (the `chronological` array). When it isn't — e.g. older messages that were dropped/never synced into the local `emails` pool, or when `emails.find(e => e.id === selectedMsgId)` finds nothing and `liveMsg` falls back to the stale row object — `chronological` only contains the synced messages, no row matches `newestId`, and nothing is expanded by default.

### Cause 3 — Auto-collapse always keeps the newest 3

Lines **2784–2786**:
```ts
const VISIBLE_RECENT = 3;
const shouldAutoCollapse = totalMessages > 5;
```

And lines **3458–3465**:
```ts
const olderHidden = shouldAutoCollapse && !olderExpanded;
const sliceStart = olderHidden
  ? Math.max(0, chronological.length - VISIBLE_RECENT)  // ← always the tail
  : 0;
const visible = chronological.slice(sliceStart);
```

For threads > 5 messages, the slice is **always the last 3 chronologically**, never the slice around the clicked message. An older clicked message is hidden behind the "show older" bar and doesn't render at all.

For the Gabb thread (3 messages, header says "3 messages") `shouldAutoCollapse = false`, so all 3 *do* render — the problem there is Causes 1+2, not the slice. But on longer threads the slice compounds the bug.

### Cause 4 — Scroll-to-clicked never runs

`EmailListAndDetail.tsx` lines **1977–1994** scrolls and highlights `[data-deeplink-msg-id="…"]` **only when `deepLinkMessageId` is set**. Because Cause 1 never sets it for a normal click, no scroll happens — the ScrollArea opens at the top of the conversation regardless of which row was clicked.

### Cause 5 — Thread isn't backfilled on open

`currentThread.emails` in `DealEmailsTab.tsx` lines **1077–1088** only filters the *in-memory* `emails` pool by `provider_thread_id || threadId`. There is no `get_thread` fetch on click — `fetchFullEmailThread` exists (`useFullEmailMessage.ts:365`) but isn't invoked when the user opens a thread. So whatever isn't already in `emails` (older messages, mail in other labels) silently disappears from the conversation, contributing to Cause 2.

### Not the cause
- No "show only recent N" cap on Gabb-sized threads — `shouldAutoCollapse` only kicks in past 5.
- No per-message body fetch issue — `useFullEmailMessage` lazy-loads bodies when a row expands, but the row has to render expanded first, which is exactly what's failing here.
- No deal/label filter — the detail pane uses the live `emails` array, not the filtered list.

## Proposed fix

1. **Pass the clicked message id as a deep link.** In `DealEmailsTab.tsx` `handleSelectThread` (~1270), after `setSelectedThread(thread)`, also:
   ```ts
   setDeepLinkTarget({
     threadId: thread.threadId,
     messageId: thread.latestEmail.id,
     signal: 'click',
   });
   ```
   Drop the existing 6 s auto-clear when `signal === 'click'` — the deep link can stay sticky for the lifetime of the open thread so the scroll runs once and the expand state persists. Reset on `handleEmailDetailBack`.

2. **Slice around the clicked message, not the tail.** In `EmailListAndDetail.tsx` lines 3458–3465, when `deepLinkMessageId` is set and falls outside the tail slice, either:
   - Auto-set `olderExpanded = true` (simplest), or
   - Compute `sliceStart = Math.min(tailStart, indexOfClicked)` so the clicked message and everything after it render.

3. **Make `defaultExpanded` use the deep-link id as the source of truth.** Treat `deepLinkMessageId ?? thread.latestEmail.id` as the canonical expand target so the clicked message is expanded even when there's no separate "newest" concept to fall back on.

4. **Backfill the thread on open.** In the `EmailDetail` (or `currentThread` memo), when `selectedThread` changes and `convoEmails.length < expected` (or always, idempotently), invoke `fetchFullEmailThread(thread.provider_thread_id)` and merge the returned messages into `currentThread.emails`. This guarantees the clicked older message is in `chronological` and therefore eligible for expansion + scroll.

5. **Verification:**
   - Click Matt Rich's "Gabb Wireless Financial Model" message in the list → detail opens, Matt's message is expanded, ScrollArea scrolls to it, brief amber highlight ring.
   - Click the same thread's newest reply → that reply is expanded and in view; older messages remain collapsed.
   - Open a 10-message thread, click the 7th message → "show older" auto-unfolds, the 7th is expanded and scrolled to.

## Files to touch

- `src/components/deal/DealEmailsTab.tsx` — `handleSelectThread` (~1270), reset target in `handleEmailDetailBack` (~1292), allow `signal: 'click'` in the `deepLinkTarget` type (~392).
- `src/components/deal/email/EmailListAndDetail.tsx` — `EmailDetail` slice + `defaultExpanded` (3454–3490), scroll effect (1977–1994) — minor: trigger when deep-link target equals the row's own message id.
- `src/components/deal/email/useFullEmailMessage.ts` — expose a small hook (or invoke `fetchFullEmailThread` from `EmailDetail`) to merge full thread messages when the conversation is partially loaded.

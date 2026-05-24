## Draft Reply UX — route through Inline Reply composer with suggested options

### 1. Current Draft Reply path (the pop-up)

- **Trigger:** `EmailQuickActionsToolbar.tsx` → "Draft Reply" pill → `onOpenDraft` prop.
- **Handler:** `src/components/deal/email/AiAssistSidebar.tsx` L1019–1038 — `onOpenDraft` dispatches the `naitive:ai-assist:open-popout-draft` CustomEvent (and a fallback effect at L850–861 does the same once a draft body resolves).
- **Mount target:** `src/components/deal/email/EmailListAndDetail.tsx` L2573–2597 listens for that event and calls `setPopOutDraft({ ... })`, which mounts `<PopOutComposer />` at L3423–3437 (`src/components/deal/email/PopOutComposer.tsx`).
  - PopOutComposer is the full pop-up surface (To / Subject / formatting toolbar / signature / Polish / Attach / Snippets / Insert availability / Draft with AI).
- The per-thread toolbar "Reply" button (`handleReply`, L2255) already mounts `<InlineReplyComposer />` inline (L3316–3333). Visually heavy (`h-[min(92vh,980px)]`) but it is the in-place composer, not a modal. Draft Reply will be aligned with this same surface.

### 2. Inline Reply + Suggested Replies today

- **Inline composer:** `src/components/deal/email/InlineReplyComposer.tsx`, mounted at `EmailListAndDetail.tsx` L3316 with props `replyTo`, `initialDraft`, `onSend`, `onDiscard`, `onPopOut`, `onDraftChange`, `onFieldBlur`, `saveStatus`, `tokenContext`, `dealId`, `dealName`, `signature`.
- **Suggestions engine (single source of truth):** `smart-email-ai` edge function, action `generate_draft_options`, invoked from `AiAssistSidebar.generateTone()` (L569–660). Returns one body per tone (`concise`, `balanced`). Stored in `result.options[tone].body`. **Do not fork prompts.**
- **AI Assist → Inline bridge already exists:** `AiAssistSidebar` `onInsertDraft` (prop wired in `EmailListAndDetail.tsx` L3393–3414) sets `setReplyTo(target)` + `setInlineDraft({ ... body })` — i.e. populates the inline composer. This is the path Draft Reply will reuse.

### 3. Minimal refactor

Strictly additive. Reuses existing components and the existing `generate_draft_options` engine.

| File | Change |
|---|---|
| `src/components/deal/email/AiAssistSidebar.tsx` | Replace `onOpenDraft` body (L1019–1038): stop dispatching `naitive:ai-assist:open-popout-draft`. Instead: (a) set `draftOpen=true`, (b) ensure both tones are queued via `generateTone('concise')` + `generateTone('balanced')`, (c) dispatch a new `naitive:ai-assist:open-inline-draft` CustomEvent `{ threadId }` so the parent opens the InlineReplyComposer in-place with no prefilled body yet. Also delete the L850–861 "pop-out pending tone" effect (or no-op it) so a generated draft never auto-opens PopOutComposer from Draft Reply. PopOutComposer remains reachable from the InlineReplyComposer "pop-out" affordance only. |
| `src/components/deal/email/EmailListAndDetail.tsx` | Add listener for `naitive:ai-assist:open-inline-draft` (mirrors L2573–2597 but calls `setReplyTo(getReplyTarget())` + `setInlineDraft(null)` instead of `setPopOutDraft`). Remove or guard the existing `open-popout-draft` listener so Draft Reply no longer triggers the pop-up (PopOutComposer stays mounted only when the user hits InlineReplyComposer's `onPopOut`). |
| `src/components/deal/email/InlineReplyComposer.tsx` | Add an optional `suggestedReplies?: Array<{ id: string; toneKey: 'concise'\|'balanced'; label: string; body: string; loading?: boolean }>` prop, plus `onSelectSuggestion?(id)` + `onRegenerateSuggestions?()`. When non-empty AND the body textarea is empty (or user hasn't manually edited), render a new `SuggestedReplyCards` section above the body textarea: 2–3 radio cards (Concise / Balanced / +Custom-regenerate). Selecting a card fills the body via existing `onChange` path and records `selectedSuggestionId` locally. Once user types into the textarea, mark "touched" so re-selecting won't clobber edits without confirmation. |
| `src/components/deal/email/SuggestedReplyCards.tsx` *(new, presentational only)* | Radio-card list. Skeleton state while `loading`. No network calls — pure props. |
| `src/components/deal/email/AiAssistSidebar.tsx` (cont.) | Pass `result.options` → InlineReplyComposer via a new `onInsertDraftSuggestions(options)` callback that hits the same `onInsertDraft` channel but with a structured payload. Implementation: extend the existing `onInsertDraft` prop signature to accept `{ body?: string; suggestions?: SuggestedReply[] }` (backward-compatible — current callers pass a string, new caller passes object). Parent (`EmailListAndDetail.tsx` L3393–3414) routes `suggestions` into the `<InlineReplyComposer />` `suggestedReplies` prop via a new `inlineSuggestions` state, and continues to handle `body` as today. |

No prompt fork: suggestions come from the same `generateTone(tone)` call already used for Draft Reply (which itself calls `generate_draft_options`). The third "+Custom" card simply re-invokes `generateTone('balanced', { regenerate: true, customInstructions })` with the existing path.

### 4. Out of scope (untouched)

Schedule Meeting flow, NOTES generator (`scheduleMeetingNotes.ts`, `QuickBookMeetingPopover.tsx`), Availability Check, deal recognition, calendar rendering, all edge functions (no prompt or model changes), the send pipeline (`handleSendFromComposer`), `meeting-holds/*`, `calendar-events/*`, `create_calendar` action, `calendar_id` column, `GCAL_SMOKETEST_CALENDAR_ID` env var.

### 5. Test plan

New file: `src/components/deal/email/__tests__/draftReplyInline.test.tsx` (Vitest + RTL).

1. Mount `<EmailListAndDetail />` with a fixture thread (Project Vista) and AI Assist toggled on. Stub `supabase.functions.invoke('smart-email-ai', …)` to return two fake options.
2. Click the "Draft Reply" pill in `EmailQuickActionsToolbar`.
3. Assertions:
   - **(a)** `screen.queryByTestId('popout-composer')` is `null` (PopOutComposer NOT mounted).
   - **(b)** `screen.getByTestId('inline-reply-composer')` is in the DOM.
   - **(c)** `screen.findAllByRole('radio', { name: /concise|balanced/i })` returns ≥ 2 cards.
   - **(d)** Click a card → the `<textarea>` `value` equals that option's body.
   - **(e)** "Send" button is rendered. Disabled until either a card is selected or the textarea has non-empty text. Enabled after step (d).
4. Negative test: clicking the per-thread toolbar "Reply" button does NOT mount PopOutComposer (only InlineReplyComposer).

(Add `data-testid="popout-composer"` to PopOutComposer root and `data-testid="inline-reply-composer"` to InlineReplyComposer root as part of this PR — both purely additive.)

### 6. Before / after DOM sketch (Project Vista thread)

```text
BEFORE  (current Draft Reply)
EmailListAndDetail
├─ ThreadDetail (Project Vista)
│  └─ ScrollArea (messages)
├─ AiAssistSidebar
│  └─ EmailQuickActionsToolbar [Draft Reply] ─click──┐
└─ PopOutComposer  ◄──────────────── modal pop-up ───┘
   (To / Subject / Toolbar / Signature / Polish / …)

AFTER   (Draft Reply → inline)
EmailListAndDetail
├─ ThreadDetail (Project Vista)
│  └─ ScrollArea (messages)
├─ InlineReplyComposer  ◄─── opened in place at thread bottom
│  ├─ SuggestedReplyCards
│  │   (•) Concise   ( ) Balanced   ( ) + Custom
│  ├─ <textarea> (populated when card selected)
│  └─ [Send] [Discard] [Pop out]
└─ AiAssistSidebar
   └─ EmailQuickActionsToolbar [Draft Reply] (no longer dispatches popout event)
```

### Phase 2 (after approval)

Implement per above, run the Vitest, paste pass/fail counts, then re-render Project Vista's Draft Reply flow and paste a DOM-tree snapshot for sign-off.

### Code freeze restatement

The code freeze otherwise remains in place. The previously-shipped `create_calendar` action, the nullable `meeting_holds.calendar_id` column, and the `GCAL_SMOKETEST_CALENDAR_ID` env hook are still default-off in production: `calendar_id` defaults to `"primary"`, `create_calendar` has zero client call-sites, and the smoke-test env var is not set in prod.

**STOP. Awaiting "approved" before Phase 2.**
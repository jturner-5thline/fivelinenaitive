# Draft Reply — Auto-Draft Into Textarea (Plan, Phase 1)

Scope is strictly additive to the Draft Reply inline composer flow. **Code freeze otherwise remains in place.** Previously-shipped `create_calendar` action, `calendar_id` column, and `GCAL_SMOKETEST_CALENDAR_ID` env stay default-off in production (`calendar_id` resolves to `"primary"` when null; smoketest env unset in prod).

---

## 1. Current data path (files quoted)

**Mount of the inline composer on Draft Reply click**
- `src/components/deal/email/AiAssistSidebar.tsx` L1046: the Draft Reply pill dispatches `naitive:ai-assist:open-inline-draft` with `{ threadId }` and kicks `generateTone('balanced')` / `generateTone('concise')`.
- `src/components/deal/email/EmailListAndDetail.tsx` L2587–2590: listener calls `setReplyTo(getReplyTarget())`, leaving `inlineDraft` null.
- `EmailListAndDetail.tsx` L3325: `<InlineReplyComposer suggestedReplies={inlineSuggestions} ... />`.

**Card data path**
- `AiAssistSidebar.tsx` L860–876 `useEffect`: re-emits `TONE_ORDER.map(...)` into `onInsertSuggestions(...)` on every change to `result` / `loadingTones`. Bodies are empty strings while loading.
- `EmailListAndDetail.tsx` L3410 `onInsertSuggestions` writes to `setInlineSuggestions`.
- `InlineReplyComposer.tsx` L80–95: `selectedSuggestionId` + `handleSelectSuggestion` set body when a card is clicked. There is **no effect that auto-populates `body` on mount or when the recommended draft resolves** — that is the root cause of BAD #1.

## 2. Why the textarea is empty

- `InlineReplyComposer.tsx` L77: `const [body, setBody] = useState(initialDraft?.body ?? '')` — initialized empty.
- There is no `useEffect` watching `suggestedReplies` that seeds `body` once the Recommended (`balanced`) option resolves. Cards render correctly but nothing fills the textarea unless the user clicks a card.

## 3. Why the sidebar shows "Taking longer than expected"

- `AiAssistSidebar.tsx` L579–683 `generateTone`: 30s `AbortController` timeout, `fastModel: true` by default, calls edge function `smart-email-ai` with `action: 'generate_draft_options'`, `singleTone`.
- On timeout / error, L673–675 sets `setError('Taking longer than expected. Tap Retry to try a different model.')`. The sidebar renders this banner and skeletons remain.
- **Coupling problem:** the cards in the inline composer are fed from the same `result` + `loadingTones` (L860–876). When generation fails, `loadingTones[tone]` flips false but `result.options[tone]` is never set, so the suggestion stays `{ body: '', loading: false }` forever — cards become permanently empty/disabled and the textarea also stays empty.
- The sidebar "Suggested Update" analyzer is a separate query (`workflowAnalysis` / `dealContextSummary`); confirmed it is not what feeds the cards. Only `generateTone` failures starve the cards.

## 4. Minimal change set

| # | File | Change |
|---|------|--------|
| a | `InlineReplyComposer.tsx` | Add `recommendedSuggestionId?: string` prop (parent passes `tone-balanced`). New `useEffect`: when `body === ''` and `!userTouched` and a non-loading recommended suggestion arrives, call `handleSelectSuggestion(recommendedSuggestionId)` to seed textarea. Track `userTouched` via `handleBodyChange` (already clears `selectedSuggestionId` — extend to set `userTouchedRef.current = true`). |
| b | `InlineReplyComposer.tsx` | On card click when `userTouchedRef.current && body.trim() !== ''` and selected body differs, render a small `AlertDialog` confirm ("Replace your edits with this suggestion?"). Confirm → swap; cancel → no-op. Uses existing `@/components/ui/alert-dialog`. |
| c | `InlineReplyComposer.tsx` | While the recommended suggestion is `loading` and `body === ''`, render an italic muted `Drafting…` placeholder via `EmailComposerCard`'s existing `placeholder` (or a thin overlay if the prop isn't surfaced — small additive prop `bodyPlaceholder`). Cleared once body is populated. Send button stays enabled per existing rules. |
| d | `AiAssistSidebar.tsx` | Decouple failure: in the `generateTone` catch block, also write a sentinel `DraftOption { body: '', error: true }` into `setResult` so the suggestions effect L860 emits `{ loading: false, error: true }` for failed tones. The inline composer then renders the failed card as a "Retry" affordance instead of permanent spinner. Cards for the successful tone still populate normally — single-tone failure no longer starves the other. |
| e | `AiAssistSidebar.tsx` | Move the sidebar's `setError(...)` banner state behind a check that ONLY both tones failed. Single-tone failure no longer shows the global "Taking longer than expected" banner — that banner today fires on the first failure and is what the user observed even though Concise may still resolve. Per-card retry replaces it. |
| f | `SuggestedReplyCards.tsx` | Accept `error?: boolean` on a card and render a tiny "Retry" link that calls `onRegenerate` for that tone. |

No edits to: `smart-email-ai` edge function, scheduling, NOTES generator, availability check, deal recognition, calendar render, send pipeline, `meeting-holds/*`, `calendar-events/*`, `create_calendar`, `calendar_id`, `GCAL_SMOKETEST_CALENDAR_ID`.

## 5. Test plan (Vitest + RTL, extending `draftReplyInline.test.tsx`)

1. **Auto-populate on mount** — mount `<InlineReplyComposer suggestedReplies={[balancedReady, conciseReady]} recommendedSuggestionId="tone-balanced" />`; assert `screen.getByRole('textbox', { name: /body/i }).value` equals `balancedReady.body` within 2s (`waitFor`).
2. **Swap on card click (clean)** — click `Shorter`; assert textarea becomes `conciseReady.body`, no confirm dialog.
3. **Dirty-edit guard** — type into textarea, then click another card; assert `AlertDialog` opens; confirm → body replaced; cancel → original edit preserved.
4. **Drafting… placeholder** — mount with `[{loading:true, body:''}, {loading:true, body:''}]`; assert textarea placeholder text `Drafting…`; rerender with resolved balanced; assert textarea now contains resolved body and placeholder gone.
5. **Sidebar failure does not block inline (decoupled)** — mock `supabase.functions.invoke` for `singleTone:'balanced'` → reject 504, `singleTone:'concise'` → resolve. Mount `<AiAssistSidebar>` + capture `onInsertSuggestions`; assert eventually two suggestions emitted with `tone-balanced` carrying `error:true` and `tone-concise` carrying a real body; assert global error banner NOT shown when at least one tone resolved.
6. **No popout regression** — re-assert `popout-composer` testid not in DOM (existing test extended).

## 6. Phase 2

After "approved":
- Implement (a)–(f).
- Run `bunx vitest run src/components/deal/email/__tests__/draftReplyInline.test.tsx` and paste output.
- Re-render Project Vista Draft Reply flow; paste textarea-populated screenshot + `data-testid="inline-reply-composer"` DOM snapshot showing populated `<textarea>` and `aria-checked="true"` on Recommended card.

Awaiting **approved** to begin Phase 2.

## Investigation summary (no code changes made)

### Where the bubble lives

There are two separate "comment" entry points in Insights, and they are wired to different components:

1. **Highlight → floating "Comment" button**
   - File: `src/components/insights/AgendaComments.tsx`, component `SelectionCommentAction` (lines ~414–498).
   - Listens to TipTap's `editor.on('selectionUpdate', …)` and to `contextmenu` on `editor.view.dom`.
   - Mounted only by `AgendaEditor` (`src/components/insights/AgendaEditor.tsx`), which is rendered only inside the Agenda tab in `ManagementReviewCarousel`.
   - It is tied to a TipTap `Editor` instance — it cannot fire on tabs that aren't TipTap editors.

2. **Right-click → contextual composer**
   - File: `src/components/metrics/dashboards/qir/QirContextualComments.tsx` (`useEffect` at line ~246 adds a `contextmenu` listener on `rootRef.current`).
   - It is wrapped around the other Insights tabs by `InsightsContextualSurface` (`src/components/insights/InsightsContextualSurface.tsx`) inside `ManagementReviewCarousel.tsx`:
     - Agenda → `InsightsContextualSurface … <AgendaEditor />`
     - Dashboard → `InsightsContextualSurface … <ManagementReviewDashboard />`
     - Forecasts → `InsightsContextualSurface … <BenchmarkForecastsPage />`
     - Key Metrics → `InsightsContextualSurface … <KeyMetricsPage />`
     - JT/JM/SW → `QuarterlyReportSlot` → `QuarterlyInsightsReport.tsx` line 3322 mounts `QirContextualComments` directly.
   - There is no `selectionchange`/`mouseup` listener anywhere in this path — only `contextmenu`.

### Root cause

The "comment bubble that appears when I highlight text" is **only** the `SelectionCommentAction` in `AgendaComments.tsx`. It is bound to a TipTap editor, so it can only ever appear in the Agenda tab. On Dashboard, Forecasts, Key Metrics, JT, JM and SW there is no equivalent highlight-triggered bubble — only the right-click contextmenu composer from `QirContextualComments`. So the behaviour the user is reporting on non-Agenda tabs is "as built", not a regression of a previously-working feature. The right-click composer itself is still wired on every non-Agenda tab via `InsightsContextualSurface` and `QirContextualComments` and should still open.

(If right-click is also failing on a specific non-Agenda tab, that would be a separate issue — most likely an ancestor with `pointer-events: none`, an `onContextMenu` handler that calls `stopPropagation`, or a nested portal that escapes `rootRef`. None of those are present in the current code paths I traced.)

### Recommended fix (to implement after approval)

Add a DOM-level selection bubble that works outside TipTap so every Insights tab gets the same highlight-to-comment affordance:

1. Create `src/components/insights/comments/SurfaceSelectionBubble.tsx` — a small floating "Comment" button that:
   - Listens to `document.addEventListener('selectionchange', …)` and `mouseup` scoped to `rootRef.current`.
   - Reads the live `window.getSelection()`, ignores empty/whitespace selections, and ignores selections inside `input`, `textarea`, `[contenteditable="true"]`, or the existing TipTap editor (skip when `target.closest('.ProseMirror')` so Agenda's existing bubble keeps working).
   - Positions itself near the end of the selection range's bounding rect using `position: fixed`, with the same z-index/styling as `SelectionCommentAction`.
   - On click, opens the same composer state that the right-click path uses — i.e. calls into `QirContextualComments` with the resolved source + selected snippet.

2. Mount it inside `InsightsContextualSurface` next to `QirContextualComments`, passing the same `rootRef`, `reportLabel`, `sectionIdPrefix`, `sectionLabels` and `fallbackSourceLabel`.

3. Wire the composer open path: easiest is to lift the composer state into a small shared hook (`useSurfaceCommentComposer`) and have both the contextmenu handler in `QirContextualComments` and the new bubble's onClick call `openComposer({ source, snippet, hasSelection: true })`. Existing addComment/promote/insertFootnote logic stays unchanged.

4. Leave `AgendaComments.SelectionCommentAction` untouched — but in the new DOM-level bubble's filter, early-return when `target.closest('.ProseMirror')` so the two systems don't both render on the Agenda editor.

### Files involved

- Read/trace: `src/components/insights/InsightsContextualSurface.tsx`, `src/components/metrics/dashboards/qir/QirContextualComments.tsx` (lines 246–297), `src/components/insights/AgendaComments.tsx` (lines 414–498), `src/components/insights/AgendaEditor.tsx`, `src/components/metrics/dashboards/ManagementReviewCarousel.tsx` (lines 370–394), `src/components/metrics/dashboards/QuarterlyInsightsReport.tsx` (line 3322).
- New file: `src/components/insights/comments/SurfaceSelectionBubble.tsx`.
- Edits: `src/components/insights/InsightsContextualSurface.tsx` (mount the bubble), `src/components/metrics/dashboards/qir/QirContextualComments.tsx` (export an `openComposer` API or share via a context/hook).

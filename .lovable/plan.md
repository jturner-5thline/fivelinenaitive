## Goal

Make every comment created anywhere in an Insights Report (narrative text, KPIs, charts/figures, goals, initiatives, risks, generic sections) reviewable in one lightweight **Agenda Queue**, and let users push queued items into the Agenda using the existing footnote/recap pipeline. Keep the UI light and document-like — no Kanban, no ticketing chrome.

## Strategy

Reuse what already exists; do not introduce a parallel system:

- **Comment capture** stays on the two existing systems — `agenda_comments`/`agenda_comment_threads` (Agenda editor) and `qir_comments`/`qir_comment_threads` (right-click on QIR elements). Extend the QIR comment surface to also cover narrative text and chart/figure containers.
- **Agenda Queue** = a new lightweight table `report_agenda_queue` that references the originating comment plus structured source/anchor info. Nothing about comments themselves changes.
- **Agenda insertion** routes through the **already-built** `useInsertAgendaFootnote` event bus + `insights_agenda_footnotes` table. Queue items become footnotes (with optional body refs) when promoted.

## Backend

### New table `report_agenda_queue`
Fields (per the prompt's data-model guidance):
- `id`, `company_id`, `period_type`, `period_key`
- `report_tab` (JT/JM/SW; nullable for non-report surfaces)
- `source_type` enum: `selected_text | narrative | kpi | chart | goal | initiative | risk | section`
- `source_id`, `source_anchor`, `source_snapshot_text`
- `comment_id` (FK → `qir_comments.id` or `agenda_comments.id`; polymorphic via `comment_source` column: `qir | agenda`)
- `comment_text_snapshot` (denormalized for the queue list)
- `created_by`, `created_at`, `updated_at`
- `queue_status` enum: `queued | added_to_agenda | dismissed | archived`
- `linked_footnote_id` (FK → `insights_agenda_footnotes.id`)
- `agenda_insertion_mode` enum: `body_reference | free_text | footnote_only` (set when promoted)

RLS: scoped by `is_company_member(auth.uid(), company_id)`. Realtime-enabled. GRANTs to `authenticated` + `service_role`. Created timestamp trigger.

### Extend existing
- Add a small `period_type`/`period_key` denormalization on `qir_comments` (nullable backfill) so queue items derived from QIR comments inherit a clean period scope, matching the agenda system. Migration backfills from the active report's period when known.
- `insights_agenda_footnotes.source_type` already supports arbitrary strings — reuse with values: `report_comment`, `report_comment_kpi`, `report_comment_chart`, etc. Add `source_anchor` formatted as `qir-section-{key}#{target_type}:{target_id}` so the existing footnote dedup index handles uniqueness.

## Frontend

### 1. Generalize the QIR right-click comment surface
- `QirContextualComments` already walks for `data-comment-source` / `data-comment-source-id`. Decorate the remaining elements that are not yet annotated:
  - Narrative container in `InsightsNarrativeEditor` body (`source_type="narrative"`).
  - Each chart/figure wrapper in QIR (`source_type="chart"`, id = chart key).
  - Initiative rows (`source_type="initiative"`) — currently only goals/risks/KPIs are tagged.
- Keep right-click as the entry on charts/figures/KPI tiles/section blocks. Selection-based "Comment" button stays the entry for prose.

### 2. Add selection-based comment to narrative
- Reuse `SelectionCommentAction` + `CommentMark` + `NewThreadPopover` (already built for AgendaEditor) on `InsightsNarrativeEditor` by extracting them into a shared module under `src/components/insights/comments/`.
- Because narrative content lives in JSONB (`company_settings.fpa_dashboard_config`), narrative comments use the **QIR comment tables** with `target_type='narrative-range'` and `target_id` = stable hash of the anchor text + offset. Threads still resolve back to the visible prose via highlight marks rendered around `<mark data-comment-thread-id="…">` on the dangerously-set HTML pass.

### 3. "Add to Agenda Queue" action on every comment surface
- New `PromoteToQueueButton` in:
  - The QIR comment thread popover (`QirContextualComments` thread footer).
  - The Agenda thread card popover (`AgendaComments` `ThreadCard`).
- Action inserts a row into `report_agenda_queue` with `queue_status='queued'`, capturing source/anchor/snapshot from the comment's host element (already known at the surface).
- Optimistic UI + realtime invalidation.

### 4. Agenda Queue review panel
- Single compact drawer/popover, opened from a small badge in the Agenda editor toolbar ("Queue · 4") and from a quiet link in the QIR controls bar.
- Renders a flat list grouped by source type with: snippet, author, when, source-type chip, "Jump to source" link (uses the existing `jumpToSource` scroll-and-flash from `QirContextualComments`).
- Per-item actions (matching the prompt):
  1. **Add to Agenda** — calls `useInsertAgendaFootnote` with the queue item's source/anchor/snapshot, then dispatches `agenda:insert-footnote-ref` so the Agenda editor inserts a body reference at the current cursor. Sets `queue_status='added_to_agenda'`, `agenda_insertion_mode='body_reference'`, persists `linked_footnote_id`.
  2. **Add to Agenda as Free Text** — opens a tiny inline composer; on save inserts a paragraph in the Agenda doc with a footnote ref appended. Same status update with `agenda_insertion_mode='free_text'`.
  3. **Add as Footnote Only** — calls `useInsertAgendaFootnote` without firing the body-ref event. `agenda_insertion_mode='footnote_only'`.
  4. **Dismiss / Archive** — sets `queue_status='dismissed'` (or `archived`).
- Filter chips: All / Queued / Added / Dismissed. Default view: Queued only.
- No sidebar permanence; the panel is a `Popover`/`Sheet` matching the agenda comments side-rail visual style.

### 5. Traceability
- Each queue item stores `source_id` + `source_anchor` + denormalized `source_snapshot_text`, so the "Jump to source" action works even if the underlying content was edited later. If the live element still exists, we scroll + flash via the existing util. If not, we show the snapshot text in a tooltip.
- The promoted footnote inherits the same anchor, so the existing "current vs. snapshot" drift detection on `insights_agenda_footnotes` (`source_current_text` vs `source_snapshot_text`) keeps working.

### 6. Persistence + multi-user
- New table + comment tables already realtime-enabled. The Queue panel subscribes to the realtime channel `report_agenda_queue:{company_id}:{period_type}:{period_key}` and re-renders on insert/update.
- All scoping uses `company_id + period_type + period_key + report_tab` so JT/JM/SW are cleanly separated.

## Files touched

### New
- `supabase/migrations/<ts>_report_agenda_queue.sql` — new table + RLS + grants + dedup index + denormalized `qir_comments.period_type/period_key`.
- `src/hooks/useReportAgendaQueue.ts` — list/insert/update/realtime.
- `src/components/insights/comments/PromoteToQueueButton.tsx`
- `src/components/insights/comments/AgendaQueuePanel.tsx`
- `src/components/insights/comments/AgendaQueueBadge.tsx`
- `src/components/insights/comments/sharedSelectionComment.tsx` — extracted `SelectionCommentAction` + `CommentMark` for reuse on narrative.

### Edited
- `src/components/insights/AgendaComments.tsx` — add Promote button on `ThreadCard`; expose queue badge in the side-rail header.
- `src/components/insights/AgendaEditor.tsx` — mount `AgendaQueuePanel` trigger in toolbar.
- `src/components/insights/InsightsNarrativeEditor.tsx` — wire up selection comment action + render existing thread highlights.
- `src/components/metrics/dashboards/qir/QirContextualComments.tsx` — add Promote action in thread popover; widen `data-comment-source` resolution for initiatives + chart wrappers; reuse `jumpToSource` for queue panel.
- `src/components/metrics/dashboards/QuarterlyInsightsReport.tsx` — decorate chart/figure containers and initiative rows with `data-comment-source` attributes; place `AgendaQueueBadge` in the report controls bar.
- `src/components/insights/footnotes/useInsertAgendaFootnote.ts` — accept a new optional `{ queueItemId, insertionMode }` so promotion writes back to the queue row when the editor acks.

## Non-goals

- No changes to the agenda autosave, period derivation, RLS scoping shape, or the existing footnote dedup behavior.
- No new mention syntax; we keep both existing formats and only normalize at the queue-display layer.
- No project-management features (assignees, due dates, statuses beyond queued/added/dismissed/archived).

## Acceptance check

- Right-click any chart/KPI/section/initiative/goal/risk in JT/JM/SW → comment → "Add to Queue" → item appears in `AgendaQueuePanel` for any other user on the same company/period.
- Select narrative text → "Comment" → submit → "Add to Queue" → same queue item visible.
- Promote queue item with each of the four actions; verify body insertion / free-text insertion / footnote-only / dismissal all behave per spec and update `queue_status`.
- "Jump to source" scrolls and flashes the original element when present; shows snapshot otherwise.
- All state survives refresh and is identical across users of the same company/period.

## Open question (worth confirming before build)

Should the **narrative comment threads** live in `agenda_comment_threads` (so they share the same editor-style threading with mentions in `@[Name](uuid)` format) or in `qir_comments` (matching the rest of the report surfaces)? My recommendation: **`qir_comments`** — keeps all report-surface comments consistent and avoids tying narrative comments to an `agenda_id` row that may not exist for the period. If you'd rather unify around `agenda_comment_threads`, the queue model still works unchanged — only the comment-source FK switches.

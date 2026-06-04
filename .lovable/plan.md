## Goal

Make each JT / JM / SW tab render as one continuous, polished monthly report by default. Keep all existing data sources, persistence, integrations, autosave, period scoping, comments, and drill‑downs. This is a presentation-layer pass only — no business logic changes.

## Scope of files

- `src/components/metrics/dashboards/QuarterlyInsightsReport.tsx` (main — header, sections wiring, KPI section, Risks, controls/utility chrome)
- `src/components/metrics/dashboards/qir/QirSummaryView.tsx` (Narrative section already renders HTML; reuse / align)
- `src/components/insights/InsightsNarrativeEditor.tsx` (hide toolbar in resting state, expose `readOnly` mode)
- `src/components/metrics/dashboards/WhatWorkingSections.tsx` (read-first prose, edit on focus)
- New small primitives in `qir/` for shared document chrome (`DocSection`, `DocMeta`, `InlineEditable`)

## Visual model

Switch the page body from a stack of glass cards with toolbars to a single-column document column (max width ~960px) with:
- Typographic section headings (no card borders for body sections)
- Subtle horizontal dividers between sections
- Consistent vertical rhythm (e.g. 40px between sections, 16px inside)
- Quiet metadata row at the top (no boxes)
- All operational controls (sort/group/filter/sync/source pickers/Save/Reset) moved to a single thin "Report controls" bar above the document, or behind a "View source data" disclosure inside each section

The Card glass surface is retained only for KPI tiles and the document container's outermost frame.

## Section-by-section changes

### Header / metadata
- Replace the labeled inputs for `Date Prepared` and `Prepared By` with a one-line metadata row: `Prepared by {name} · {date} · {period}`.
- Click pencil (appears on hover) to reveal the inline `<input>`/`<select>` controls. Blur or ✓ commits.
- The author tab pills (JT/JM/SW) and period switcher stay where they are (those are navigation, not body).

### Narrative / Executive Summary
- Keep `InsightsNarrativeEditor`, add a `chromeless` mode: toolbar hidden until the editor is focused (or a "Edit" pencil clicked).
- Resting state renders prose at document type scale (existing HTML sanitized render path).
- Attachments list rendered as a clean inline strip; uploader UI only when editing.

### KPIs
- Default view: a compact KPI summary row (label + value + delta), no "Add KPI" button in the main flow.
- "Add KPI / Manage KPIs" moves into a small `Edit KPIs` link in the section header (opens existing `AddKpiDialog`).
- Existing KPI cards (`SalesClientsKpiCard`, `TtmRevenuePerHourKpiCard`) keep their drill behavior but render in a tighter grid without heavy card chrome.

### Goals (Asana-backed)
- Default body: a narrative-style summary list — one row per visible goal: `Title · Owner · Status pill · Progress`. No grouping headers, no sort/group toolbar.
- The full sourced table (current `ReportGoalsSection` body), `SortGroupToolbar`, filter mapping panel, and sync controls collapse into a `<details>` titled "View source data" at the bottom of the section.
- Header right-rail shows only a small "Synced {relative time}" and a Refresh icon button.

### Initiatives
- Default body: a clean list of entries — title (link to Asana), owner avatar/name, status pill, short summary (description first line), optional due date.
- Portfolio selector, sort/group toolbar, and raw portfolio table collapse into the same `View source data` disclosure.
- Status counts row (On Track / At Risk / Off Track) preserved as a quiet inline summary, drill-through still wired.

### Open Risks
- Default body: each risk renders as a structured prose block:
  - bold risk statement
  - "Mitigation:" paragraph beneath
  - subtle "Edit · Remove" action links visible on hover
- Inputs (`textarea`) appear in place only when a block is in edit mode (click anywhere in the block to edit; blur commits).
- "Add Risk" becomes a single ghost-link at the end of the list.

### What's Working / What's not Working
- Render each as a prose block by default. Click to edit → reveals the rich editor (existing `WhatWorkingSections` already uses TipTap; add a `readOnly`/`viewMode` toggle that flips on focus / pencil).
- Helper text only shows in edit mode.

### Controls / utility chrome
- Single slim top control bar: `Save state pill` (Saved · Saving) + `Reset` overflow (in a kebab menu).
- Per-section Sync buttons removed from the body; a single "Sync sources" button lives in the kebab menu and triggers all relevant refreshes.
- Print/share buttons stay where they are (page-level chrome).

## Shared primitives to add

In `src/components/metrics/dashboards/qir/DocPrimitives.tsx`:
- `DocSection({ title, meta?, actions?, children })` — borderless section with a typographic heading, optional muted meta line, and right-aligned hover-only actions.
- `DocDivider` — 1px subtle divider with generous vertical spacing.
- `SourceDataDisclosure({ label = 'View source data', children })` — `<details>` styled to match the doc.
- `InlineEditable({ value, onCommit, render, editor })` — read-mode renders `render(value)`; click/pencil swaps to `editor`, commit on blur or ✓.
- `MetaRow({ items })` — quiet `· `-separated metadata line.

## Consistency

JT, JM, SW all flow through the same `ReportState`/`ReportSetState`, so all three tabs inherit the document presentation automatically. No per-author branching is added.

## Non-goals

- No changes to autosave logic, period derivation, Asana fetching, RLS, edge functions, drill-down drawers, comments, print logic, or persistence shape.
- No new dependencies.
- `QirSummaryView` (read-only summary modal) is left alone except where it must accept the same HTML narrative it already accepts.

## Acceptance check (after implementation)

- Default JT/JM/SW view shows: metadata line, narrative prose, KPI summary, goals list, initiatives list, risks prose, what's working prose, what's not prose — no visible textareas, no inline toolbars, no source tables, no group/sort/sync controls in the reading column.
- Clicking a section reveals its existing editor/controls in place.
- Save status, autosave, period scoping, Asana data, and drill-throughs all behave exactly as before.

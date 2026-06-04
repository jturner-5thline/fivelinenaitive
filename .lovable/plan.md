
## Goal

Add a shared "structured footnote" layer to the Insights Agenda so Decisions, Notes, and Action Items captured from source surfaces (call transcripts, comment threads, meeting artifacts, tasks) become canonical, traceable footnotes scoped to the same reporting period as the Agenda — without changing the current minimal visual design.

The Agenda body holds references + optional free text. The bottom Footnotes section is the system of record.

## Data model (new tables)

1. `insights_agenda_footnotes`
   - `id` uuid pk
   - `company_id` uuid (RLS scope)
   - `agenda_period_type` text ('month' | 'quarter'), `agenda_period_key` text (matches existing `insights_agenda` check constraint)
   - `footnote_type` text ('decision' | 'note' | 'action_item')
   - `source_type` text ('claap_meeting' | 'cell_comment' | 'agenda_comment' | 'task' | 'manual' | …)
   - `source_id` uuid null, `source_anchor` text null (e.g. transcript timestamp, comment thread id, task id)
   - `source_snapshot_text` text — frozen at insert time (integrity)
   - `source_current_text` text — refreshed when source changes
   - `source_updated_at` timestamptz — last seen source mtime
   - `link_url` text null — deep link back to origin
   - `status` text default 'active' ('active' | 'archived')
   - `created_by` uuid → `auth.users`
   - `created_at`, `updated_at`
   - Indexes: `(company_id, agenda_period_type, agenda_period_key)`, `(source_type, source_id)`
   - Dedup helper: unique partial index on `(company_id, agenda_period_key, agenda_period_type, source_type, source_id)` where `source_id is not null and status='active'` — prevents duplicate canonical entries for the same source unless user opts to duplicate (handled by inserting with a synthetic `source_anchor` suffix).

2. `insights_agenda_footnote_refs` — body→footnote join (a single footnote can have many in-body markers)
   - `id` uuid pk
   - `footnote_id` uuid fk → `insights_agenda_footnotes(id)` on delete cascade
   - `company_id` uuid (mirrored for RLS), `created_by` uuid, `created_at`
   - The actual placement lives inside the TipTap doc as a `footnoteRef` mark/node carrying `data-footnote-id` + `data-ref-id`. The join row exists so we can answer "how many references point at this footnote?" cheaply at delete time without scanning every period's doc.

RLS (both tables): `company_id` must belong to caller's companies (same pattern used by `insights_agenda` / `cell_comments`). Grants: `SELECT/INSERT/UPDATE/DELETE` to `authenticated`, `ALL` to `service_role`.

## TipTap extensions

- `FootnoteRefMark` (inline mark, non-inclusive)
  - Attrs: `footnoteId`, `refId`, `label?` (short visible text when inserted as a marker; free-text mode uses the surrounding text instead)
  - Renders as `<sup class="agenda-footnote-ref" data-footnote-id data-ref-id>` showing the live computed footnote number (rendered via React decoration, not stored in attrs, so reordering doesn't require attr rewrites).
- ProseMirror decoration plugin walks the doc top-to-bottom and assigns sequential numbers to each unique `footnoteId` in order of appearance. Numbering is derived, never persisted — reordering body content automatically renumbers.

## Source-surface context menu

Single reusable component `AgendaFootnoteContextMenu` (wraps `@radix-ui/react-context-menu`) used wherever Decisions/Notes/Action Items live. Initial integration: Claap meeting decisions/notes/actions panels and existing Agenda comments. Items:

- Add to Agenda
- Add to Agenda as Free Text
- Add as Footnote Only

A thin `useInsertAgendaFootnote()` hook centralizes:
1. Resolve current agenda row (company + period) via `insights_agenda` upsert (reusing existing logic).
2. Upsert footnote (dedup by `(source_type, source_id)` unless user explicitly duplicates).
3. For Add-to-Agenda variants: dispatch a custom event `agenda:insert-footnote-ref` carrying `{ footnoteId, mode: 'marker' | 'freetext', snapshotText }`. The Agenda editor listens, inserts at current selection, falling back to a "click in the agenda to place" toast prompt when no editor selection exists or the editor isn't mounted.
4. For Footnote Only: just create the footnote row — it shows up in the Footnotes section on next render.

## Agenda editor changes

- Mount the new mark + decoration plugin alongside existing `CommentMark`.
- New `AgendaFootnotesSection` rendered below `<EditorContent>` (not inside the editor). Subscribes via Supabase realtime to `insights_agenda_footnotes` filtered by `company_id`+period. Items shown in order of appearance in the editor doc (using decoration plugin's ordered list, falling back to `created_at` for footnote-only entries that have no body reference yet).
- Each footnote row: `[n] [type chip] snapshot text · created by · timestamp · ↗ open source`. Muted secondary styling consistent with existing prose (no card, just `border-top` separator + small type — matches the Agenda's current minimalism).
- "Source updated" indicator: small dot when `source_current_text !== source_snapshot_text`, with hover diff. Background polling is out of scope for v1 — `source_current_text` refreshed lazily when the footnote panel mounts for visible footnotes.
- Click footnote marker → scroll to footnote row (smooth, highlight pulse).
- Click footnote row → if `link_url` present, navigate; else focus the first body reference.
- Removing a body reference: if it's the last ref pointing at the footnote, show a tiny inline prompt — "Keep footnote / Remove footnote". Default keep.

## Autosave / persistence

- Body refs are persisted inside the existing `content_json` autosave path — no changes to the agenda save shape.
- Footnote rows persist independently via their own table. Numbering is derived at render so no resave is needed when content reorders.

## Files touched / added

Added
- `supabase/migrations/<ts>_insights_agenda_footnotes.sql`
- `src/components/insights/footnotes/FootnoteRefMark.ts`
- `src/components/insights/footnotes/footnoteNumberingPlugin.ts`
- `src/components/insights/footnotes/AgendaFootnotesSection.tsx`
- `src/components/insights/footnotes/AgendaFootnoteContextMenu.tsx`
- `src/components/insights/footnotes/useInsertAgendaFootnote.ts`
- `src/components/insights/footnotes/types.ts`

Edited
- `src/components/insights/AgendaEditor.tsx` — register mark + plugin, listen for `agenda:insert-footnote-ref`, render `<AgendaFootnotesSection />` below editor.
- One initial source surface to demonstrate the wiring — wrap the existing Agenda-side comment items (and Claap decision/action items if a quick integration target exists) with `AgendaFootnoteContextMenu`. Other surfaces can adopt the menu later.
- `src/integrations/supabase/types.ts` (auto-regen after migration approval).

## Acceptance check

- Right-click a source decision → "Add to Agenda" → superscript marker appears at caret, new footnote row at bottom, deep link back to source works.
- Refresh page → marker + footnote persist, numbering stable.
- Drag a paragraph above another → footnote numbers re-derive in new order, no resave.
- Edit underlying source text → "source updated" dot appears; snapshot text in footnote remains untouched.
- Re-add same source item → reuses the existing footnote and adds a second body ref.
- Two users on same period see same footnotes via realtime.

## Out of scope (v1)

- Citations / linked meeting artifacts in surfaces other than Agenda (data model supports them; UI lands later).
- Conflict UI for concurrent body edits beyond what the existing autosave already does.
- Bulk migration of legacy Agenda free-text decisions into structured footnotes.

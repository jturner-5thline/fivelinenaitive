## Goal

Show "Last Contact At" — the most recent date anyone on your team interacted with a contact — across the app.

## Where it will appear

1. **Contact detail page** — header field next to phone/email.
2. **CRM contacts list/table** — new sortable, filterable column.
3. **Deal detail → Contacts panel** — small badge under each contact row.
4. **Approval queue → right-hand details column** — shown in the contact target block so reviewers see recency at a glance.

## What counts as "contact"

Any team-wide activity touching the contact's email:
- Inbound or outbound email (Gmail + Microsoft synced messages, sent messages)
- Calendar event the contact attended
- Claap meeting the contact attended
- Note logged against the contact
- Task whose assignee/follower link references the contact

The latest timestamp across all of these wins. Scope = entire workspace/company, not just the current user.

## How it will be computed

A single Postgres function `public.get_contact_last_contact_at(contact_id uuid) → timestamptz` that takes the `MAX(created_at/sent_at/started_at)` across:

- `gmail_messages` (any user in the same company) where the contact's email is in to/from/cc
- `ms_synced_emails` (same)
- `gmail_sent_messages`
- `calendar_events` where the contact email is in attendees
- `claap_meeting_participants` joined to `claap_meetings`
- `contact_activities`
- `tasks` linked via `task_associations` to the contact

To keep reads fast we add a denormalized column `contacts.last_contact_at timestamptz` plus an index, and a backfill + lightweight triggers on the source tables that bump the contact row when new activity arrives. The function above is the recompute primitive used by the backfill and the triggers.

## UI changes

- **`src/pages/ContactDetail.tsx`** — add "Last contact" row in the header card. Format: `Jun 14, 2026 · 10 days ago` (em dash if null: "No activity yet").
- **CRM contacts table** (column registry + table component under `src/components/crm/`) — add `last_contact_at` column, sortable, default visible, with the same relative-time chip.
- **Deal contacts panel** (under `src/components/deal/`) — show "Last contact: 10d ago" under each contact name.
- **Approval queue** (`src/components/ai-queue/ActionQueuePanel.tsx`) — when the action target is a contact (`target_object_type === 'contact'`), render a "Last contact at" line in the existing meta block of the right-hand details pane.

A shared `useContactLastContact(contactIds: string[])` hook batches lookups via the denormalized column, so all surfaces render with one query.

## Technical details

- Migration 1: add `contacts.last_contact_at timestamptz`, index `(company_id, last_contact_at desc)`.
- Migration 2: create `public.get_contact_last_contact_at(uuid)` (security definer, search_path = public), and `public.refresh_contact_last_contact(uuid)` that updates the column.
- Migration 3: one-time backfill (`UPDATE contacts SET last_contact_at = public.get_contact_last_contact_at(id)`).
- Migration 4: lightweight `AFTER INSERT` triggers on `gmail_messages`, `gmail_sent_messages`, `ms_synced_emails`, `calendar_events`, `claap_meeting_participants`, `contact_activities`, `tasks` that call `refresh_contact_last_contact` for any contact whose email matches.
- Frontend: one `useContactLastContact` hook in `src/hooks/`, one `<LastContactChip />` component in `src/components/contacts/`, reused everywhere.

## Out of scope

- No new permissions surface — RLS on `contacts` already governs visibility.
- No backfill of historical activity beyond what's already in those tables.
- Per-user "last contact by me" — only the team-wide view, as requested.
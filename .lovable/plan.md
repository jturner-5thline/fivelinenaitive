## Goal

Combine per-lender/per-funding-source "Nudge [X]" email drafts on the same deal into a single Approval Queue item titled "Follow up with Lenders", with the right-hand detail pane exposing each individual draft for edit/approve/reject.

## What changes

Purely a client-side grouping layer on top of the existing queue — no schema, no edge function changes. Each underlying `draft_email` row still exists and is approved/rejected individually via the current mutation paths.

### 1. Detect nudge drafts per deal
In `ActionQueuePanel.tsx`, after `groups` is built (line ~449) and before the list renders:
- For each `DealGroup`, partition `items` into `nudgeItems` (action_type `draft_email` whose title matches `/^\s*nudge\b/i` OR whose linked-entity is a lender/funding source) and `otherItems`.
- If `nudgeItems.length >= 2`, replace them in the group with one synthetic bundle entry: `{ id: 'bundle:nudges:<deal_id>', action_type: 'draft_email_bundle', title: 'Follow up with Lenders', bundled: nudgeItems, deal_id, deal_name, count }`.
- If only 1 nudge exists, leave it as-is (no bundling).

### 2. List column
`QueueRow` gets a small branch: when `item.action_type === 'draft_email_bundle'`, render the standard row with a "· N drafts" suffix and the email icon. Selection uses the synthetic id.

### 3. Detail column
New sub-view in the detail pane (near the existing `isEmailDraft` block, ~line 1341):
- When the selected item is a bundle, render a vertical list of collapsible cards — one per underlying draft — each showing recipient (funding source / lender name + email), subject, and body using the existing `EmailDraftPreview` component.
- Each card has its own inline "Approve" and "Reject" buttons wired to the existing per-item mutations (`approveMutation`/`rejectMutation`) passing that child's real id.
- Header of the pane shows "Follow up with Lenders · {dealName}" and a top-level "Approve all" + "Reject all" that iterates the child ids sequentially (with a confirm() on Reject all, matching the pattern just added).

### 4. Selection & counts
- Bundle contributes `1` to the visible list count, but the deal group badge still shows the true underlying count (sum across bundled + other items) so nothing is hidden.
- After approving/rejecting individual child drafts, the bundle auto-collapses to a single remaining draft once only one child is left, and disappears entirely when all are handled.

## Technical notes

- No changes to `useAiActionQueue`, DB, or edge functions. The bundle is a `useMemo`-derived synthetic node keyed off the real queue rows returned by the hook.
- Recipient labeling reuses the existing `linked_entity_type/linked_entity_id` fields the drafts already carry (funding_source / lender). Fallback to parsing the title (`Nudge Worthy` → `Worthy`) if entity data is absent.
- `TYPE_META` gets a new `draft_email_bundle` entry (label "Email drafts", icon `FileText`) so the row chip renders correctly.
- No global styling changes; reuses the current tile gradient and email preview visuals.

## Files touched
- `src/components/ai-queue/ActionQueuePanel.tsx` (grouping, row branch, detail pane, bundle approve/reject handlers)

## Out of scope
- Combining non-nudge drafts.
- Combining across different deals.
- Server-side batch approve endpoint (kept as sequential per-item calls; can be optimized later if slow).
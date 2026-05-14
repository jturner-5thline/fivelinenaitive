# Header pop-up swipe navigation

Make the floating header's pop-ups behave as one ordered sequence so the
user can move between them (click, keyboard, or swipe) with a horizontal
slide animation instead of a close-then-open jump.

## Scope

In scope (the icons in the floating header on `/deals`, `/naitive-pipeline`, etc.):

```text
[ Calendar ] [ Mail ] [ Action Queue ] [ Tasks ] [ Deal Rundown ]
            [ Dashboard* ] [ Daily Rundown** ] [ Niki's Rundown** ]
```

`*` 5th Line only · `**` allowlisted users only — order is whatever the
header actually renders for the current user.

Out of scope: deal overlay (already has its own ←/→ tile-aware nav), the
notification banner, in-overlay internal navigation (e.g. Calendar's
month arrows keep working unchanged).

## Behavior

1. While any header overlay is open, the user can move to the adjacent
   header pop-up via:
   - clicking a small **prev / next chevron pill** that floats just
     under the header (only the chevron for an existing neighbour
     renders; both hidden when only one overlay is enabled for the user),
   - pressing **←** / **→** when focus isn't in an editable field,
   - **horizontal swipe / two-finger trackpad swipe** on the overlay
     surface, past a clear threshold (≈80px or velocity > 0.3),
   - clicking another header icon while an overlay is already open
     (today this is blocked because the header is hidden — we'll keep
     the header visible while overlays are open so cross-icon clicks
     route through the same animated transition).
2. Direction is derived from icon order: moving right uses a
   right-to-left slide-in, moving left uses left-to-right.
3. The transition is a coordinated swap: outgoing overlay slides + fades
   out in the travel direction, incoming overlay slides + fades in from
   the opposite side. ~220ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
4. Swipe is gated so it never fires while the user is scrolling
   vertically inside an overlay (axis-lock: ignore the gesture if
   `|dy| > |dx|` in the first 12px of movement).
5. `prefers-reduced-motion` collapses the slide to an instant swap.

## Technical changes

### 1. New module `src/lib/headerOverlayNav.ts`

- `HeaderOverlayId` union of the overlay labels currently in use
  (`'Calendar' | 'Mail' | 'Action Queue' | 'Tasks' | 'Deal Rundown'
  | 'Dashboard' | 'Daily Rundown' | "Niki's Daily Rundown"`).
- Stores the **current direction** (`'left' | 'right' | null`) and
  exposes `setDirection(dir)` + `getDirection()`. Used by the global
  CSS rules below to drive enter/exit animation direction without
  threading props through every overlay.

### 2. `src/components/deals/DealsHeader.tsx`

- Build an ordered array `overlayOrder` from the same nav `[{label, ...}]`
  array that already drives the icon row, so the order is automatically
  the visible left-to-right icon order for the current user.
- Add helpers:
  - `currentOverlayId()` derives the active id from the existing
    `is*Open` booleans (single source of truth — no duplicated state).
  - `goToOverlay(dir: 1 | -1)` finds the current index, picks the
    neighbour, sets the slide direction, then in a `requestAnimationFrame`
    closes the current `setIs…Open(false)` and opens the next.
- Stop hiding the header when an overlay is open (`isHeaderOverlayOpen`
  branch). Keep the header visible so cross-icon clicks route through
  `goToOverlay` based on which icon was clicked. Today's behaviour of
  hiding the header was a stylistic choice; with the new swipe flow we
  want the icons reachable.
- Render a small `OverlayNavChevrons` floater just under the header
  (portaled to body) showing left/right chevrons for the available
  neighbours and current overlay name. Hidden when there's no neighbour
  in that direction. Only renders while an overlay is open.
- Install global keyboard listener for ←/→ that calls `goToOverlay`,
  guarded against editable focus and only active while an overlay is
  open. Uses capture phase so it wins over individual overlays' own
  arrow handlers (each overlay we touch needs to skip its own ←/→
  binding when this is active — verified per overlay below).

### 3. Swipe layer

- A `useHeaderOverlaySwipe()` hook attached at the header level
  installs `pointerdown`/`pointermove`/`pointerup` listeners on
  `document` while an overlay is open. Tracks dx/dy from pointerdown:
  - If `|dy| > |dx|` after 12px → release (vertical scroll wins).
  - If `|dx| > 80` or `vx > 0.3` at pointerup → call `goToOverlay`.
- Skips when the pointer started inside an `<input>`, `<textarea>`,
  `[contenteditable]`, scrollable list with horizontal overflow, or
  inside `[data-no-overlay-swipe]` (escape hatch for nested
  carousels/drag handles in any overlay that needs it).

### 4. Slide animation in CSS (`src/index.css`)

Add two keyframes (`slide-in-from-right`, `slide-in-from-left`) plus
matching `slide-out-to-left` / `slide-out-to-right`, ~220ms with
`cubic-bezier(0.16, 1, 0.3, 1)`. Target the existing dialog content
class via attribute selectors stamped on `<html>`:

```text
html[data-header-overlay-dir="right"] [data-radix-dialog-content][data-state="open"]  → slide-in-from-right
html[data-header-overlay-dir="right"] [data-radix-dialog-content][data-state="closed"] → slide-out-to-left
html[data-header-overlay-dir="left"]  ... mirrored
```

This avoids touching each overlay component individually — every one of
them already uses Radix Dialog (or a near-equivalent) under the hood.
Cleared after the close transition completes (`transitionend` listener).

For `prefers-reduced-motion: reduce`, the keyframes degrade to
`opacity 0 → 1` only.

### 5. Per-overlay tweaks (minimal)

- `FullCalendarView`: it already binds ←/→ for month navigation. Wrap
  that handler with a check `if (event.target?.closest('[data-no-overlay-swipe]'))`
  and add `data-no-overlay-swipe` to its calendar grid so its arrows
  keep working inside the calendar but ←/→ outside the grid trigger
  the overlay swap.
- `InboxDialog`, `TasksOverlay`, `DailyBriefingModal`,
  `ActionQueuePanel`, `DashboardModal`: no internal ←/→ bindings to
  preserve — no changes needed beyond ensuring their root content
  carries the standard Radix `data-radix-dialog-content` attribute
  (already true for all of them).

## Acceptance checks

- Open Calendar → press → → Mail slides in from the right; Calendar
  slides out to the left. Press → again → Action Queue. Press ← →
  Mail returns from the left.
- Open Calendar → click the **Mail** icon in the still-visible header →
  same right-direction transition (skipping past intermediate icons is
  fine — direction is just based on relative index).
- Two-finger trackpad swipe left on the open overlay → next overlay.
- Vertical scroll inside any overlay never triggers a swap.
- Inside Calendar's grid, ←/→ still moves months. Outside it, ←/→ jumps
  overlays.
- With `prefers-reduced-motion: reduce`, transitions are instant.
- ESC still closes the overlay entirely, not switches it.
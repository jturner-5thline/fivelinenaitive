
# Replace Dashboard "No Notifications" with Notification Content

## Overview
When the Dashboard Notification widget has no notifications to display, instead of showing a generic "No notifications at this time" message, it should display the same content that appears in the notifications dropdown on the Deals page. This includes real-time alerts, engagement data, and AI suggestions.

## Current Behavior
- The `NotificationCarousel` component displays static empty data
- When empty, it shows: "No notifications at this time" with a bell icon
- The `WorkflowSuggestionsWidget` and `AgentSuggestionsWidget` are shown in a separate section below

## Proposed Changes

### 1. Update NotificationCarousel Component
Modify `src/components/dashboard/NotificationCarousel.tsx` to:
- Replace static empty data with real data from hooks
- Add the same data sources used by NotificationsDropdown:
  - `useDealsContext` for stale deal alerts
  - `useFlexNotifications` for FLEx engagement alerts  
  - `useAllActivities` for recent activity
  - `useNotificationPreferences` for filtering preferences
  - `useNotificationReads` for read/unread tracking
- When notifications exist, display them in the carousel format
- When no real notifications exist, show the AI suggestion widgets instead

### 2. Empty State Behavior
When there are no stale alerts, FLEx notifications, or activities:
- Display `WorkflowSuggestionsWidget` content (Suggested Automations)
- Display `AgentSuggestionsWidget` content (Recommended Agents)
- Keep the same card styling for consistency

## Technical Details

### Data Hooks to Add
```text
- useDealsContext (for stale alerts)
- usePreferences (for staleness thresholds)
- useFlexNotifications (for FLEx alerts)
- useAllActivities (for activity feed) 
- useNotificationPreferences (for filtering)
- useNotificationReads (for read state)
```

### Stale Alert Calculation
Reuse the same logic from NotificationsDropdown:
- Check lenders with tracking status "active"
- Compare days since update against yellow threshold
- Group by deal for display

### Empty State Layout
```text
+----------------------------------------+
|  Card with gradient background         |
|  ┌──────────────────────────────────┐  |
|  │ ⚡ Suggested Automations          │  |
|  │ [Workflow suggestion items...]    │  |
|  └──────────────────────────────────┘  |
|  ┌──────────────────────────────────┐  |
|  │ 🤖 Recommended Agents             │  |
|  │ [Agent suggestion items...]       │  |
|  └──────────────────────────────────┘  |
+----------------------------------------+
```

## Files to Modify
1. `src/components/dashboard/NotificationCarousel.tsx` - Main changes to integrate real data and add empty state content

## Considerations
- The carousel will need to handle different notification types (stale alerts, FLEx, activity)
- Read/unread state will be managed via the notification reads system
- Preferences filtering ensures users only see notification types they've enabled
- If both real notifications AND suggestions exist, show notifications (suggestions become the fallback)

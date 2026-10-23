# Restore Open Items management in Tasks

## Confirmed findings
Email AI's duplicate declaration is fixed and deployed. Preflight and authenticated synthetic thread analysis returned 200; the startup/authentication regression test passed. Existing function lint reports 54 unrelated errors; the preview build is successful.

The signed-in deal preview confirms Open Items only offers completion and single-item addition when merged with Tasks. The full editor's existing controls are not reachable. Completion also sends a field that is not persisted; stored completion is derived from Received and Submitted.

## Changes
- Keep the merged All / Tasks / Open Items filters, current widget dimensions, transparent divider rows, and right-side item tags.
- Restore editing, Received/Submitted status, ETA, requesters, and deletion through the existing Open Item editor and compact row actions.
- Add an Open Items management menu for bulk addition, reordering, default checklist application, and existing checklist phase actions. Keep these available even when the list is empty.
- Preserve inactive-deal restrictions and display the existing read-only reason; disabled controls must not call mutation callbacks.
- Correct completion/reopening to persist Received and Submitted together, using the existing update path.
- Preserve the full Open Items widget when Tasks is turned off; do not duplicate the list or introduce new storage.

## Technical details
- Reconnect existing callbacks and context in `DealDetail.tsx` to `DealTasksPanel.tsx`.
- Reuse the existing item dialog and bulk/checklist logic; extract shared management controls only where necessary to avoid divergent implementations.
- Add explicit read-only support to reused editing controls where currently missing.
- Keep company scoping, database schema, and existing activity logging unchanged.

## Verification
- Add interaction regression tests for filters, search, item editing/status/ETA, deletion, bulk addition, ordering, checklist actions, and read-only rejection.
- Assert completion and reopening map to persisted status fields.
- Run relevant tests and targeted lint; inspect automatic preview build results.
- Exercise desktop and small-screen controls in the signed-in preview, without modifying live deal records. Verify persistence using mocked storage; actual live saving remains unverified unless an approved test environment or test-record writes are available.

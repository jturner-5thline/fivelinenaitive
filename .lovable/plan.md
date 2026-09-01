# Phase 3 lender matching feedback loop

## Scope
- Load the active calibration snapshot into client-side lender matching.
- Load active weights into the server-side recommender so new recommendations use the same calibration.
- Add an admin control to compute, inspect, and activate calibration snapshots.
- Correct calibration aggregation for the recommendation component payload format.

## Technical details
- Preserve the existing conservative bounds and sample-size shrinkage.
- Keep snapshots inactive until an admin explicitly activates them.
- Use the existing recommendation outcomes and run-item logs; no new data tables are required.

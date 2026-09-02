# Roadmap

- [x] End of Day: clicking a meeting no longer opens a follow-up task automatically
- [x] Apply the navy-to-blue app backdrop to Contacts, Deals and Queue pages
- [x] Wire Queue approval actions to real deal status changes (pending -> approved -> closed)

## Funding source matching

- [x] Phase 1 — structured matching criteria (sweet spot, geographies, financial thresholds) + backfill
- [x] Phase 2 — historical track record scoring, hard eligibility gates, visible match explanations
- [x] Phase 3 — outcome feedback loop tuning (weight calibration from recommendation outcomes)

## Calendar ingestion

- [x] Verified Scott Williams' Nylas grant + ran claap-backfill (120 days). Root cause: his calls are not recorded in Claap, which is the sole source for `claap_meetings` — calendar reconnection does not affect this metric.

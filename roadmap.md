# Roadmap

## Homepage rebuild
- [ ] Update and verify the lifecycle sequence from the uploaded brief.
- [x] Apply uploaded Platform brief; removed embedded pipeline preview, verified five cards and navigation at 1280/1138/820/390px, targeted lint and five existing tests passed; preview build OK.
- [x] Rebuild public homepage using the uploaded operating-system brief and shared demo modal; optional notes included in deployed enquiry email template.
- [x] Verify homepage and demo interactions at 1280px, 1139px and 390px without sending real communications; five form tests, targeted lint and preview build passed.
- [x] Replace testimonial monogram with supplied Greg Blount photo and intersected fade mask; verified at 1280/820/658/390px, lint and preview build passed. Local asset serving required hosted-image proxy during browser verification; hosted image returns successfully.
- [ ] Verify real demo email delivery — requires approval to send a test communication; intercepted requests verified instead.

- [x] Fix smart-email-ai duplicate declaration; deployed, preflight and authenticated synthetic analysis returned 200, startup/auth regression test passed; existing function lint errors remain.
- [x] Restore Open Items editor, bulk/checklist management, status and reorder controls in merged Tasks; regression tests and desktop/mobile read-only preview checked.
- [ ] Verify Open Items saves against approved test records — blocked by shared production data; no live records changed during verification.

- [x] Ensure both funding-source CSV imports create or reuse company-scoped CRM contacts and link them; 12 regression tests and build passed, CSV preview checked without live writes.
- [ ] Verify an actual import and persisted Contacts entry — blocked by shared production data; requires an approved test environment or test-record writes.

- [x] Source Deal Activity client meetings from all connected same-company calendars; verified live client meeting read, Daily chart, isolation and duplicate-counting tests.

- [x] End of Day: clicking a meeting no longer opens a follow-up task automatically
- [x] Apply the navy-to-blue app backdrop to Contacts, Deals and Queue pages
- [x] Wire Queue approval actions to real deal status changes (pending -> approved -> closed)

## Funding source matching

- [x] Phase 1 — structured matching criteria (sweet spot, geographies, financial thresholds) + backfill
- [x] Phase 2 — historical track record scoring, hard eligibility gates, visible match explanations
- [x] Phase 3 — outcome feedback loop tuning (weight calibration from recommendation outcomes)

## Calendar ingestion

- [x] Calendar is authoritative for referral meetings, with optional Claap recording/transcript enrichment.
- [x] Restrict referral calendar ingestion to the requested team-owner allowlist.
- [x] Exclude meetings with funding-source or client attendee domains, including all linked client contacts and company URLs.
- [x] Include Claap-matched client companies and all affiliated CRM contacts across every deal pipeline.

- [x] Exclude calendar events with no attendees and titles "Block"/"Blocked" from referral meeting counts

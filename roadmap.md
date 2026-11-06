# Roadmap

## Open Items MCP writes
- [x] Confirmed and reported JSON status, completion semantics, supported priorities, unused assignment text, active-list ordering and activity_logs behavior; lender_id references deal_lenders.
- [ ] Add caller-scoped list/create/update tools with idempotency, preserved metadata and archive-only retirement; keep the table schema unchanged.
- [ ] Resolve status-input and open_only meaning with user before implementation; verify tests, permissions, manifest and approved real-deal widget states without unapproved communications.

## Funding-source refresh MCP additions
- [x] Expand criteria confidence values without changing existing criteria.
- [x] Add caller-scoped, audited manual Claap meeting matching and paginated meeting discovery; database support applied and verified.
- [x] 14 new tests / 60 targeted MCP tests, isolated permissions/audit rollback checks, focused lint and automatic build passed; signed-in discovery and confidence dry runs verified at 1280px. Manifest contains 91 tools. Full suite: 548 passed, 18 existing failures.
- [ ] Hosted OAuth match-write acceptance — requires republish and approved test records; no live match writes or communications performed. Existing Cloud/auth reused; no services enabled or dependencies removed.

## MCP lender additions
- [x] Fixed nonexistent created_by/lender_id/status writes; use canonical tenant lender name/master_lender_id, on-deck/active defaults, timestamps, UI and deal activity feeds, explicit overrides and unique-race no-op handling.
- [x] Eleven new regression tests passed (21 targeted total); targeted lint and automatic preview build passed; extracted 49-tool catalog. Full suite: 510 passed, 18 unrelated failures; full lint retains existing widespread failures. No dependencies removed or new services enabled.
- [x] Real caller-scoped LAGO handler returned already_on_deal; signed-in 1280px Funding Sources tab inspected; database confirmed seven rows, one LAGO and zero shortlist test rows.
- [ ] Verify live SaaS Capital/Revtek adds and cleanup — blocked by email, agent and webhook insert/delete side effects in the shared production database. Mocked requested three-lender acceptance passed; no live writes performed. Hosted revised MCP requires republishing and has not been verified through an OAuth client.

## Contact company linking
- [x] Search the full tenant company directory by name and domain from both contact link entry points with pagination, loading and retry.
- [x] Add Bank of America Corporation's alternate domains and link Jason Stone only; preserve all other contacts.
- [x] Nine new regression tests and targeted lint passed; automatic type/build checks passed. Signed-in preview verified name/domain search, selection, empty results and cancel at 1280px/390px; Jason's company association persisted after refresh. No extra test writes or communications. Full suite: 496 passed, 18 unrelated failures; full lint has existing errors. Published frontend not verified.

## Claap funding-source tagging and four-year backfill
- [x] Automatically link recordings and calendar attendees to tenant-scoped funding sources and contacts, preserving manual decisions and existing deal links.
- [x] Add controlled resumable four-year discovery and quota-aware summary/transcript hydration, with start/pause/resume controls and the existing hourly wake-up.
- [x] Four Deno tests, seven isolated SQL assertions and three UI interaction tests passed; focused lint, worker check and full TypeScript check passed; signed-in status and desktop/390px controls checked without starting imports.
- [ ] Execute and verify historical import/content persistence — awaiting approval to run the production backfill; provider coverage before May 2025 remains unverified.

## Channel partner activity history
- [x] Record pipeline additions and stage moves with tenant-isolated, read-only history; backfilled eight known addition dates without changing partners or inventing prior moves.
- [x] Show dated history in partner details. Six Vitest tests, nine isolated PostgreSQL assertions, targeted lint and automatic build passed; signed-in preview opening/reopening checked at 1280px/1194px and pop-up layout at 390px, with no page errors.
- [ ] Verify a live drag/drop produces persisted history — requires approved test-record writes or an isolated hosted environment; production partner stages were not changed during testing.

## Funding Sources spreadsheet design
- [x] Match Companies/Contacts table primitives, headers, rows, selection, links and shared surface styles without changing records.
- [x] Five interaction tests passed; signed-in preview sorting, selection, detail opening and horizontal/vertical scrolling checked at 1280px, plus layouts at 1198/1920/390px. Targeted lint and automatic build passed; no records changed. Existing phone header overlap and unavailable logo asset remain outside scope.

## Header logo replacement
- [x] Replace public and workspace header logos with the supplied wordmark and matching browser icon.
- [x] Verified public and signed-in header logos at 1280px and public header at 390px; login stays in the same tab, no phone overflow, targeted lint and preview build passed. Local CDN image serving was intercepted with the uploaded asset during screenshot checks.

## Invitation approval access
- [x] Confirm invitation approval gap and reproduce denial redirect with simulated preview responses; all five Blount members currently approved.
- [x] Apply transactional invitation approval with verified-recipient, inviter/company, reuse and revocation safeguards; show retry on approval-check errors; no existing records rewritten.
- [x] Eight frontend tests and 24 isolated PostgreSQL assertions passed; desktop/phone preview checked at 1280/390px with intercepted acceptance and reopen; targeted lint and automatic build passed. Broader suite: 419 passed, 18 unrelated failures.
- [ ] Verify real invitation acceptance persistence — requires approved test records or an isolated hosted environment; production invitation writes were not exercised.

## Homepage rebuild
- [x] Update lifecycle sequence from uploaded brief; verified three ordered steps, 15px dots and desktop track endpoints at 1280/1198/820/390px; targeted lint and preview build passed.
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

## Complete funding-source MCP editing
- [x] Expand master lender edits with atomic text modes, batches, concurrency, dry-run and provenance.
- [x] Add audited notes and related-record write tools, CRM contact linking and attachment metadata edits; preserve existing RLS limitations.
- [x] Add confirmed soft archive and atomic merge; refuse conflicts and unsupported references.
- [x] 39 MCP tests, isolated SQL permissions/rollback assertions, focused lint and automatic build passed; signed-in dry-run + 17-table schema discovery checked, 89-tool manifest extracted. Full suite 534 passed/18 existing failures; details and limitations in docs/lender-mcp-editing.md.
- [ ] Hosted OAuth write/merge acceptance — requires republish plus an isolated hosted test environment or explicit approval for consequential live test writes; no production records changed.

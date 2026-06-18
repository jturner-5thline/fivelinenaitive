
-- Realistic stage-aware status note backfill for demo deals.
-- Idempotent: only touches rows that still carry the legacy placeholder.
WITH note_pool AS (
  SELECT * FROM (VALUES
    ('final-credit-items',     0, 'Client gathering remaining diligence docs — chasing AR aging today.'),
    ('final-credit-items',     1, 'Compiling final credit package; expect to circulate internally tomorrow.'),
    ('final-credit-items',     2, 'Working through last open items on the credit memo before submission.'),
    ('client-strategy-review', 0, 'Strategy call set for Thursday to align on lender targeting.'),
    ('client-strategy-review', 1, 'Reviewing positioning with the client before going to market.'),
    ('client-strategy-review', 2, 'Refining the lender shortlist with the client this week.'),
    ('write-up-pending',       0, 'Investment memo in draft — analyst circulating v1 internally.'),
    ('write-up-pending',       1, 'Finalizing the write-up; CEO bio + financial summary still outstanding.'),
    ('write-up-pending',       2, 'Memo nearly done, expect to send to lenders by end of week.'),
    ('submitted-to-lenders',   0, 'Package went out to 12 lenders Monday; tracking opens and replies.'),
    ('submitted-to-lenders',   1, 'Followed up on the proposal — expecting responses by Friday.'),
    ('submitted-to-lenders',   2, 'Intro calls scheduled with two new funding sources this week.'),
    ('lenders-in-review',      0, 'Three lenders deep in review; fielding follow-up questions daily.'),
    ('lenders-in-review',      1, 'Lender requested updated financial model — sending today.'),
    ('lenders-in-review',      2, 'In due diligence — legal reviewing the data room with lead lender.'),
    ('terms-issued',           0, 'Term sheet issued — awaiting client signature.'),
    ('terms-issued',           1, 'Negotiating final pricing and covenants with the lead lender.'),
    ('terms-issued',           2, 'Aiming to countersign this week and move into closing.'),
    ('in-due-diligence',       0, 'Confirmatory diligence underway; QofE kickoff Monday.'),
    ('in-due-diligence',       1, 'Legal reviewing the credit agreement red-line; comments back midweek.'),
    ('in-due-diligence',       2, 'Coordinating site visit and management meeting with the lender.'),
    ('funded-invoiced',        0, 'Funding wired this morning — invoicing the success fee today.'),
    ('funded-invoiced',        1, 'Closed and funded last week; sending the close announcement.'),
    ('funded-invoiced',        2, 'Final closing docs executed — invoice sent to client.'),
    ('closed-won',             0, 'Deal closed — collecting testimonial and refining the case study.'),
    ('closed-won',             1, 'Wrapped up post-close items; relationship handed to ongoing coverage.'),
    ('closed-won',             2, 'Closed won — follow-up call scheduled to debrief with client.'),
    ('closed-lost',            0, 'Client paused the process — revisiting in Q3.'),
    ('closed-lost',            1, 'Lost to in-house option; staying close for the next round.'),
    ('closed-lost',            2, 'Passed by remaining lenders on leverage; archiving the file.'),
    ('on-hold',                0, 'On hold pending the client''s board meeting next week.'),
    ('on-hold',                1, 'Waiting on board feedback before moving forward.'),
    ('on-hold',                2, 'Paused — client wants to revisit after Q2 earnings.')
  ) AS t(stage_key, slot, note)
),
fallback_pool AS (
  SELECT * FROM (VALUES
    (0, 'Pending credit committee approval.'),
    (1, 'Negotiating final terms with the lead lender.'),
    (2, 'Aiming to close next week — finalizing the term sheet.')
  ) AS t(slot, note)
),
targets AS (
  SELECT
    d.id,
    d.stage,
    ROW_NUMBER() OVER (PARTITION BY d.stage ORDER BY d.created_at, d.id) - 1 AS idx
  FROM public.deals d
  WHERE d.notes ~ '^Seeded demo deal #[0-9]+\.?$'
)
UPDATE public.deals d
SET
  notes = COALESCE(np.note, fp.note),
  notes_updated_at = now() - ((2 + ((t.idx * 7) % 70)) || ' hours')::interval
FROM targets t
LEFT JOIN note_pool np ON np.stage_key = t.stage AND np.slot = (t.idx % 3)
LEFT JOIN fallback_pool fp ON fp.slot = (t.idx % 3)
WHERE d.id = t.id;

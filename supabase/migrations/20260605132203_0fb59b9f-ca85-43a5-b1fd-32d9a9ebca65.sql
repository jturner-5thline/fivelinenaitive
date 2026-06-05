-- Backfill Funding Source (lender) status notes for Blount Capital deals.
-- Surfaces on each deal's Funding Sources tab (deal_lenders.notes).
-- Scoped strictly to Blount Capital tenant (company_id below). Idempotent:
-- re-running updates notes in place and never creates duplicate associations.

DO $blount$
DECLARE
  v_company_id uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';  -- Blount Capital
  v_owner_user uuid;
BEGIN
  -- Pick an existing tenant user_id to own any newly-created master_lenders row.
  SELECT user_id INTO v_owner_user
  FROM public.master_lenders
  WHERE company_id = v_company_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- 1. Build source table (deal pattern, lender name, note). Duplicates allowed;
  --    we aggregate notes per (deal, lender) below with E'\n\n' as separator.
  CREATE TEMP TABLE _bc_src (deal_pat text, lender_name text, note text) ON COMMIT DROP;
  INSERT INTO _bc_src(deal_pat, lender_name, note) VALUES
    ('FarrPro',         'Mazuma Capital',             'Passed. Pre-revenue. Referred Priority Capital.'),
    ('Honor Pet',       'Priority Capital',           E'Preliminary 20K Ft Terms: Mid 9''s % rate 10 year term Fully amortizing Down payment 10% If outside collateral, that will help'),
    ('Globe Metals',    'Priority Capital',           'Potentially interested. JL to share teaser.'),
    ('EVRNU',           'Priority Capital',           'Interested. JL to share materials when ready.'),
    ('Water Garden',    'Priority Capital',           E'JL has yet to float Water Gardens with Priority but given Priority''s interest in BlueNalu, California Cultured and EVRNU, JL wants to give them a look at this too, safe bet they would consider.'),
    ('Club Five Health','Priority Capital',           'Discussed WE 2026.02.06 - Greg open to reviewing materials.'),
    ('Honor Pet',       'Decathlon Capital',          E'Additive to what an equipment lender would do, need 4m of revenue, 400-500K of revenue a month. Later stage option. 4-5 year term loans, payments low first year, most of the interest is PIKing (there is current pay but it''s not the full 20%), low 20''s IRR, each year payments go up, no financial covenants, no PG''s, no warrant Example of deal: Software company, 0-2m of ARR last couple years, have plenty of equity, don''t want more dilution, 2m facility, get to 8-9m, fund them 1m at close, and as they grow through the year, will keep funding incremental term loan traunches as they continue to grow'),
    ('Watches.com',     'Decathlon Capital',          E'4-5 year term loans, payments low first year, most of the interest is PIKing (there is current pay but it''s not the full 20%), low 20''s IRR, each year payments go up, no financial covenants, no PG''s, no warrants. Max out a $1M with Watches.com (given $4M of revenue). Example of deal: Software company, 0-2m of ARR last couple years, have plenty of equity, don''t want more dilution, 2m facility, get to 8-9m, fund them 1m at close, and as they grow through the year, will keep funding incremental term loan traunches as they continue to grow'),
    ('Globe Metals',    'Decathlon Capital',          'Passed, need to be senior secured on something like this'),
    ('Watches.com',     'Founderpath',                '$1.75M; 50% revenue financing'),
    ('UCEA',            'Decathlon Capital',          E'"Later this year" - 20% of revenue, if looking for additional growth capital.'),
    ('UCEA',            'Decathlon Capital',          E'Potentially could lender here, but "would probably want the family office to guarantee the loan" - if the Events business is "highly profitable", why do they need a loan? simplying trying to get someone else to absorb the risk? If this is the calculus, Decathlon likely does not have any interest. Cannot be "manipulative" in this sense.'),
    ('TicketVision',    'Decathlon Capital',          E'800K potentially more as they keep growing… 4-5 year term loans, payments low first year, most of the interest is PIKing (there is current pay but it''s not the full 20%), low 20''s IRR, each year payments go up, no financial covenants, no PG''s, no warrant'),
    ('Surevix',         'Mizzen Capital',             'Interested. JL to share one-pager / CIM + VDR access, when ready.'),
    ('RxEBATE',         'Mizzen Capital',             'Interested. JL to share one-pager / CIM + VDR access, when ready.'),
    ('Globe Metals',    'Mizzen Capital',             'Victoria to connect with bridge lender that may be interested. 6-12 month loans, could fund within the week. Would be expensive - Victoria did not say what rate. TBD.'),
    ('UCEA',            'Mizzen Capital',             'Interested. Need to understand more about business model and profitability.'),
    ('RxEBATE',         'Capitala',                   'SOFR + 5.00-7.50% 5 year term 5% amort'),
    ('RxEBATE',         'Hatch Advisors',             'secondaries guy could take out 30% partner'),
    ('Surevix',         'Argosy Credit Partners',     E'Very open to working with another partner. typical term loan. no line of credit. 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('RxEBATE',         'Argosy Credit Partners',     E'potentially interested. 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('Watches.com',     'Argosy Credit Partners',     E'interested want VDR access and materials 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('UCEA',            'Argosy Credit Partners',     E'12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('Watches.com',     'Commercial Finance Partners','SBA type structure. of interest. to share materials.'),
    ('Watches.com',     'Commercial Finance Partners','SBA loan. 8.5-9.5% 10 year term no prepay penalty fully amortizing'),
    ('Splendies',       'Commercial Finance Partners','Would look at it as a multiple of ARR. Term loan or line of credit. Potentially open to partnering with another fund, Argosy, especially if they''re willing to put in some equity. Sonny from CFP confirmed real interest. JL sending underwriting memo on 2026.03.03.'),
    ('Jean-Pierre Klifa','Argosy Credit Partners',    E'willing to come in alongside another partner and potentially consider some equity piece if other partner is debt. 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('Splendies',       'Argosy Credit Partners',     E'willing to come in alongside another partner and potentially consider some equity piece if other partner is debt. 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('TicketVision',    'Argosy Credit Partners',     E'willing to come in alongside another partner and potentially consider some equity piece if other partner is debt. 12-15% rate, sometimes go down as low as 10% doesn''t have to be amort, can be interest only, can be PIK in some situations 3 year exit'),
    ('EVRNU',           'Granite Creek',              'JL to ask Matt about additional EVRNU potential investors (ideas) JL asked Matt on 2026.02.13 - Matt to make family office intros.'),
    ('Water Garden',    'Aurum Impact',               'Ask for debt partners in U.S. if they have geo constraints.'),
    ('Surevix',         'Singular Guff',              E'only look at sponsor or ~quasi sponsor-backed transactions north of 2-3m in ebitda (will stretch lower if a real growth plan) fixed rate, low to mid teens, mezz type stuff, some portion in cash pay, some portion PIK. get at least 10% on cash pay piece. any roll? told them sponsor looking to do 15-20M in equity 70/30 debt / equity split- 80/20 is the average 57-58M check - would try to bring in one other group to partner up. are they snake oil salesman? exclusivity vendor dynamics more detail on the sponsor and background'),
    ('Surevix',         'Granite Creek',              'average check size 12-15M comfortable going up to 50-60M comfortable partnering Interested'),
    ('RxEBATE',         'Granite Creek',              'average check size 12-15M, flex to 50-60M, comfortable partnering. Interested.'),
    ('EVRNU',           'SMBC',                       'Per ChatGPT, "very active in global project finance"'),
    ('EVRNU',           'Closed Loop Partners',       E'Per ChatGPT - Probably the most on-point lender in the U.S. for recycling Explicitly provides loans into recycling infrastructure Has done: Chemical recycling loans MRF upgrades Circular infra buildouts 👉 This is #1 most relevant for Evrnu-type risk'),
    ('EVRNU',           'Copenhagen Infrastructure Partners', E'Per ChatGPT: Large-scale project finance credit fund Does energy-from-waste, biomass, circular infra 👉 Will: Write $40M Want: strong sponsor contracted revenue proven-ish tech'),
    ('EVRNU',           'Breakwall Capital',          'ChatGPT: Strategy = senior loans to sustainability inf');

  -- 2. Ensure master_lenders rows exist for each lender_name under Blount Capital.
  --    Match case-insensitively; only insert when absent.
  INSERT INTO public.master_lenders (id, user_id, company_id, name, created_at, updated_at)
  SELECT gen_random_uuid(), v_owner_user, v_company_id, s.lender_name, now(), now()
  FROM (SELECT DISTINCT lender_name FROM _bc_src) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.master_lenders ml
    WHERE ml.company_id = v_company_id
      AND ml.name ILIKE s.lender_name
  );

  -- 3. Resolve (deal_id, master_lender_id) and aggregate duplicate notes.
  CREATE TEMP TABLE _bc_resolved (
    deal_id uuid,
    master_lender_id uuid,
    note text
  ) ON COMMIT DROP;

  INSERT INTO _bc_resolved (deal_id, master_lender_id, note)
  SELECT
    d.id,
    ml.id,
    string_agg(s.note, E'\n\n' ORDER BY s.note)
  FROM _bc_src s
  JOIN public.deals d
    ON d.company_id = v_company_id
   AND d.company ILIKE '%' || s.deal_pat || '%'
  JOIN public.master_lenders ml
    ON ml.company_id = v_company_id
   AND ml.name ILIKE s.lender_name
  GROUP BY d.id, ml.id;

  -- 4a. UPDATE notes where association already exists.
  UPDATE public.deal_lenders dl
  SET notes = r.note,
      updated_at = now()
  FROM _bc_resolved r
  WHERE dl.deal_id = r.deal_id
    AND dl.master_lender_id = r.master_lender_id;

  -- 4b. INSERT association where it does not yet exist.
  INSERT INTO public.deal_lenders (id, deal_id, master_lender_id, name, notes, created_at, updated_at)
  SELECT gen_random_uuid(), r.deal_id, r.master_lender_id, ml.name, r.note, now(), now()
  FROM _bc_resolved r
  JOIN public.master_lenders ml ON ml.id = r.master_lender_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.deal_lenders dl
    WHERE dl.deal_id = r.deal_id
      AND dl.master_lender_id = r.master_lender_id
  );
END
$blount$;

DO $$
DECLARE
  v_company_id uuid;
  v_inserted int := 0;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name ILIKE '%Blount Capital%'
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Blount Capital tenant not found; nothing to do.';
    RETURN;
  END IF;

  RAISE NOTICE 'Resolved Blount Capital company_id=%', v_company_id;

  WITH src(name_pat, title, occurred_on) AS (
    VALUES
      ('Surevix',                       'Intro & Discovery | Surevix / BCC Date',                                                                       DATE '2026-01-26'),
      ('Club Condor',                   'Continued Engagement | Club Candor / BCC (Updated) Date',                                                      DATE '2026-01-29'),
      ('Insignary',                     'Kim/Gordon connect Date',                                                                                      DATE '2026-02-05'),
      ('Health Endeavors',              'He update re RevTek Date',                                                                                     DATE '2026-02-05'),
      ('Health Endeavors',              'Blount/HE Mtg Date',                                                                                            DATE '2026-02-06'),
      ('Water Garden Farms',            'RE: Deleuse <> Landzberg | Blount Capital - Next Steps Date',                                                  DATE '2026-02-12'),
      ('Insignary',                     'Insignary Check in call Date',                                                                                 DATE '2026-02-16'),
      ('EVRNU',                         'Blount/EVRNU Date',                                                                                            DATE '2026-02-18'),
      ('TRUE linkswear',                'BC/TRUE - Blackfeather Response Review Date',                                                                  DATE '2026-02-18'),
      ('TRUE linkswear',                'TRUE/BCC - Update BF Response Date',                                                                           DATE '2026-02-20'),
      ('Oak Proof',                     'RE: Camhe <> Landzberg | Next Steps Date',                                                                     DATE '2026-02-23'),
      ('TRUE linkswear',                'TRUE x BF Date',                                                                                                DATE '2026-02-24'),
      ('Black Feather Funding',         'TRUE x BF Date',                                                                                                DATE '2026-02-24'),
      ('EVRNU',                         'RE: BCC / EVRNU - Model Review, Revised Terms, & References Date',                                              DATE '2026-02-25'),
      ('Morfeu AI',                     'RE: Morfeu <> Blount | Next Steps Date',                                                                       DATE '2026-02-25'),
      ('EVRNU',                         'RE: BCC / EVRNU - Model Review, Revised Terms, & References Date',                                              DATE '2026-03-02'),
      ('Commercial Finance Partners',   'RE: Landzberg <> Palestine | Next Steps Date',                                                                 DATE '2026-03-03'),
      ('EVRNU',                         'RE: BCC / EVRNU - Model Review, Revised Terms, & References Date',                                              DATE '2026-03-05'),
      ('Rock Shelter Capital',          'Steve <> Greg <> Justin | Catchup Date',                                                                       DATE '2026-03-06'),
      ('Water Garden Farms',            'RE: Fw: Deleuse <> Landzberg | Blount Capital - Next Steps Date',                                              DATE '2026-03-09'),
      ('TRUE linkswear',                'TRUE x Black Feather Updates Date',                                                                            DATE '2026-03-10'),
      ('Black Feather Funding',         'TRUE x Black Feather Updates Date',                                                                            DATE '2026-03-10'),
      ('Level 7 Investments',           'L7 <> Blount | Argosy Pre-Call Date',                                                                          DATE '2026-03-11'),
      ('Argosy Credit Partners',        'RE: L7 Investments <> Argosy Capital | Blount Capital Intro Date',                                             DATE '2026-03-11'),
      ('Level 7 Investments',           'RE: L7 Investments <> Argosy Capital | Blount Capital Intro Date',                                             DATE '2026-03-11'),
      ('Club Condor',                   'Club Condor Debt Discussion Date',                                                                             DATE '2026-03-12'),
      ('TRUE linkswear',                'TRUE Date',                                                                                                    DATE '2026-03-12'),
      ('EVRNU',                         'BCC / EVRNU | Memo Discussion Date',                                                                           DATE '2026-03-13'),
      ('Health Endeavors',              'HE/Blount/Gordon Sync Date',                                                                                   DATE '2026-03-13'),
      ('TRUE linkswear',                'TRUE: Western Alliance <> Black Feather Date',                                                                 DATE '2026-03-13'),
      ('Black Feather Funding',         'TRUE: Western Alliance <> Black Feather Date',                                                                 DATE '2026-03-13'),
      ('Club Condor',                   'Club Condor x Blount Capital Date',                                                                            DATE '2026-03-17'),
      ('EVRNU',                         'BCC <> EVRNU | Memo Finalization Date',                                                                        DATE '2026-03-18'),
      ('Clearline Financial',           'RE: Intro Date',                                                                                                DATE '2026-03-18'),
      ('Club Condor',                   'Club Condor/Blount check in Date',                                                                             DATE '2026-03-20'),
      ('Club Condor',                   'dse-ddni-udu Date',                                                                                            DATE '2026-03-20'),
      ('Level 7 Investments',           'Justin Landzberg (Blount Capital) / Yann Com-Nougue (L7 Investments) - Consulting Agreement Discussion Date', DATE '2026-03-20'),
      ('EVRNU',                         'EVRNU <> BCC | Weekly Huddle Date',                                                                            DATE '2026-03-25'),
      ('EVRNU',                         'EVRNU <> BCC | Weekly Huddle Date',                                                                            DATE '2026-04-01'),
      ('Fortress',                      'Blount - Project Circle | Opportunity Primer & NDA Date',                                                     DATE '2026-04-01'),
      ('Club Condor',                   'Club Condor Financial Model Date',                                                                             DATE '2026-04-02'),
      ('Level 7 Investments',           'RE: Com-Nougue <> Blount | Next Steps Date',                                                                  DATE '2026-04-07'),
      ('Argosy Credit Partners',        'Placeholder - L7 <> Argosy <> Blount | Call #2 Date',                                                          DATE '2026-04-07'),
      ('Level 7 Investments',           'Placeholder - L7 <> Argosy <> Blount | Call #2 Date',                                                          DATE '2026-04-07'),
      ('Level 7 Investments',           'RE: Fw: Fw: Com-Nougue <> Blount | Next Steps Date',                                                           DATE '2026-04-08'),
      ('Utah Cannabis',                 'Argosy <> Hanna | JPK Date',                                                                                   DATE '2026-04-10'),
      ('Argosy Credit Partners',        'Argosy <> Hanna | JPK Date',                                                                                   DATE '2026-04-10'),
      ('Black Feather Funding',         'True / BFF Date',                                                                                              DATE '2026-04-15'),
      ('TRUE linkswear',                'True / BFF Date',                                                                                              DATE '2026-04-15'),
      ('Goliath Cyber Security Group',  'Greg Blount- RSP Date',                                                                                        DATE '2026-04-20'),
      ('RYE Strategic Group',           'Greg Blount- RSP Date',                                                                                        DATE '2026-04-20'),
      ('Goliath Cyber Security Group',  'Blount -RSP Discussion Date',                                                                                  DATE '2026-04-30'),
      ('RYE Strategic Group',           'Blount -RSP Discussion Date',                                                                                  DATE '2026-04-30'),
      ('Goliath Cyber Security Group',  'Blount Capital-Goliath Debt Discussion Date',                                                                  DATE '2026-05-07'),
      ('RYE Strategic Group',           'Blount Capital-Goliath Debt Discussion Date',                                                                  DATE '2026-05-07'),
      ('Goliath Cyber Security Group',  'Goliath Debt Financing Update Date',                                                                           DATE '2026-05-13'),
      ('RYE Strategic Group',           'Goliath Debt Financing Update Date',                                                                           DATE '2026-05-13'),
      ('Goliath Cyber Security Group',  'Goliath- Blount Date',                                                                                         DATE '2026-05-18')
  ),
  src_unique AS (
    SELECT DISTINCT name_pat, title, occurred_on FROM src
  ),
  matched AS (
    SELECT DISTINCT ON (s.name_pat, s.title, s.occurred_on)
      d.id AS deal_id,
      s.title,
      s.occurred_on
    FROM src_unique s
    JOIN public.deals d
      ON d.company_id = v_company_id
     AND d.company ILIKE '%' || s.name_pat || '%'
    ORDER BY s.name_pat, s.title, s.occurred_on, d.created_at ASC NULLS LAST
  ),
  ins AS (
    INSERT INTO public.activity_logs (
      id, deal_id, user_id, activity_type, description, metadata, created_at, user_display_name
    )
    SELECT
      gen_random_uuid(),
      m.deal_id,
      NULL,
      'deal_updated',
      m.title,
      jsonb_build_object(
        'source', 'blount_capital_historical_backfill_2026_06_05',
        'activity_date', to_char(m.occurred_on, 'YYYY-MM-DD')
      ),
      (m.occurred_on::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours',
      NULL
    FROM matched m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.activity_logs a
      WHERE a.deal_id = m.deal_id
        AND a.description = m.title
        AND a.created_at::date = m.occurred_on
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RAISE NOTICE 'Inserted % activity_logs rows for Blount Capital.', v_inserted;
END $$;


-- 1. Create dedicated history table (NOT surfaced in Activity feed)
CREATE TABLE IF NOT EXISTS public.deal_meeting_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_meeting_history_deal_id ON public.deal_meeting_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_meeting_history_date ON public.deal_meeting_history(meeting_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_meeting_history_dedupe
  ON public.deal_meeting_history(deal_id, title, ((meeting_date AT TIME ZONE 'UTC')::date));

GRANT SELECT ON public.deal_meeting_history TO authenticated;
GRANT ALL ON public.deal_meeting_history TO service_role;

ALTER TABLE public.deal_meeting_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting history for deals in their tenant"
  ON public.deal_meeting_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_meeting_history.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- 2. Backfill historical meetings for Blount Capital deals
DO $$
DECLARE
  bc_id UUID;
  rec RECORD;
  d_id UUID;
  meetings JSONB := '[
    {"name":"Surevix","title":"Intro & Discovery | Surevix / BCC","date":"2026-01-26"},
    {"name":"Club Condor","title":"Continued Engagement | Club Condor / BCC (Updated)","date":"2026-01-29"},
    {"name":"Insignary","title":"Kim/Gordon connect","date":"2026-02-05"},
    {"name":"Health Endeavors","title":"HE update re RevTek","date":"2026-02-05"},
    {"name":"Health Endeavors","title":"Blount/HE Mtg","date":"2026-02-06"},
    {"name":"Water Garden Farms","title":"RE: Deleuse <> Landzberg | Blount Capital - Next Steps","date":"2026-02-12"},
    {"name":"Insignary","title":"Insignary Check in call","date":"2026-02-16"},
    {"name":"EVRNU","title":"Blount/EVRNU","date":"2026-02-18"},
    {"name":"TRUE linkswear","title":"BC/TRUE - Blackfeather Response Review","date":"2026-02-18"},
    {"name":"TRUE linkswear","title":"TRUE/BCC - Update BF Response","date":"2026-02-20"},
    {"name":"Oak Proof","title":"RE: Camhe <> Landzberg | Next Steps","date":"2026-02-23"},
    {"name":"TRUE linkswear","title":"TRUE x BF","date":"2026-02-24"},
    {"name":"Black Feather","title":"TRUE x BF","date":"2026-02-24"},
    {"name":"EVRNU","title":"RE: BCC / EVRNU - Model Review, Revised Terms, & References","date":"2026-02-25"},
    {"name":"Morfeu","title":"RE: Morfeu <> Blount | Next Steps","date":"2026-02-25"},
    {"name":"EVRNU","title":"RE: BCC / EVRNU - Model Review, Revised Terms, & References","date":"2026-03-02"},
    {"name":"Commercial Finance Partners","title":"RE: Landzberg <> Palestine | Next Steps","date":"2026-03-03"},
    {"name":"EVRNU","title":"RE: BCC / EVRNU - Model Review, Revised Terms, & References","date":"2026-03-05"},
    {"name":"Rock Shelter","title":"Steve <> Greg <> Justin | Catchup","date":"2026-03-06"},
    {"name":"Water Garden Farms","title":"RE: Fw: Deleuse <> Landzberg | Blount Capital - Next Steps","date":"2026-03-09"},
    {"name":"TRUE linkswear","title":"TRUE x Black Feather Updates","date":"2026-03-10"},
    {"name":"Black Feather","title":"TRUE x Black Feather Updates","date":"2026-03-10"},
    {"name":"Level 7","title":"L7 <> Blount | Argosy Pre-Call","date":"2026-03-11"},
    {"name":"Argosy","title":"RE: L7 Investments <> Argosy Capital | Blount Capital Intro","date":"2026-03-11"},
    {"name":"Level 7","title":"RE: L7 Investments <> Argosy Capital | Blount Capital Intro","date":"2026-03-11"},
    {"name":"Club Condor","title":"Club Condor Debt Discussion","date":"2026-03-12"},
    {"name":"TRUE linkswear","title":"TRUE","date":"2026-03-12"},
    {"name":"EVRNU","title":"BCC / EVRNU | Memo Discussion","date":"2026-03-13"},
    {"name":"Health Endeavors","title":"HE/Blount/Gordon Sync","date":"2026-03-13"},
    {"name":"TRUE linkswear","title":"TRUE: Western Alliance <> Black Feather","date":"2026-03-13"},
    {"name":"Black Feather","title":"TRUE: Western Alliance <> Black Feather","date":"2026-03-13"},
    {"name":"Club Condor","title":"Club Condor x Blount Capital","date":"2026-03-17"},
    {"name":"EVRNU","title":"BCC <> EVRNU | Memo Finalization","date":"2026-03-18"},
    {"name":"Clearline","title":"RE: Intro","date":"2026-03-18"},
    {"name":"Club Condor","title":"Club Condor/Blount check in","date":"2026-03-20"},
    {"name":"Club Condor","title":"dse-ddni-udu","date":"2026-03-20"},
    {"name":"Level 7","title":"Justin Landzberg (Blount Capital) / Yann Com-Nougue (L7 Investments) - Consulting Agreement Discussion","date":"2026-03-20"},
    {"name":"EVRNU","title":"EVRNU <> BCC | Weekly Huddle","date":"2026-03-25"},
    {"name":"EVRNU","title":"EVRNU <> BCC | Weekly Huddle","date":"2026-04-01"},
    {"name":"Fortress","title":"Blount - Project Circle | Opportunity Primer & NDA","date":"2026-04-01"},
    {"name":"Club Condor","title":"Club Condor Financial Model","date":"2026-04-02"},
    {"name":"Level 7","title":"RE: Com-Nougue <> Blount | Next Steps","date":"2026-04-07"},
    {"name":"Argosy","title":"Placeholder - L7 <> Argosy <> Blount | Call #2","date":"2026-04-07"},
    {"name":"Level 7","title":"Placeholder - L7 <> Argosy <> Blount | Call #2","date":"2026-04-07"},
    {"name":"Level 7","title":"RE: Fw: Fw: Com-Nougue <> Blount | Next Steps","date":"2026-04-08"},
    {"name":"Utah Cannabis","title":"Argosy <> Hanna | JPK","date":"2026-04-10"},
    {"name":"Argosy","title":"Argosy <> Hanna | JPK","date":"2026-04-10"},
    {"name":"Black Feather","title":"True / BFF","date":"2026-04-15"},
    {"name":"TRUE linkswear","title":"True / BFF","date":"2026-04-15"},
    {"name":"Goliath","title":"Greg Blount- RSP","date":"2026-04-20"},
    {"name":"RYE Strategic","title":"Greg Blount- RSP","date":"2026-04-20"},
    {"name":"Goliath","title":"Blount -RSP Discussion","date":"2026-04-30"},
    {"name":"RYE Strategic","title":"Blount -RSP Discussion","date":"2026-04-30"},
    {"name":"Goliath","title":"Blount Capital-Goliath Debt Discussion","date":"2026-05-07"},
    {"name":"RYE Strategic","title":"Blount Capital-Goliath Debt Discussion","date":"2026-05-07"},
    {"name":"Goliath","title":"Goliath Debt Financing Update","date":"2026-05-13"},
    {"name":"RYE Strategic","title":"Goliath Debt Financing Update","date":"2026-05-13"},
    {"name":"Goliath","title":"Goliath- Blount","date":"2026-05-18"}
  ]'::jsonb;
  meeting_ts TIMESTAMPTZ;
BEGIN
  SELECT id INTO bc_id FROM public.companies WHERE name = 'Blount Capital' LIMIT 1;
  IF bc_id IS NULL THEN
    RAISE NOTICE 'Blount Capital company not found; skipping.';
    RETURN;
  END IF;

  FOR rec IN SELECT * FROM jsonb_to_recordset(meetings) AS x(name text, title text, date text) LOOP
    SELECT id INTO d_id
      FROM public.deals
     WHERE company_id = bc_id
       AND company ILIKE '%' || rec.name || '%'
     LIMIT 1;

    IF d_id IS NULL THEN
      CONTINUE;
    END IF;

    meeting_ts := (rec.date || ' 12:00:00-05')::timestamptz;

    INSERT INTO public.deal_meeting_history (deal_id, title, meeting_date, source)
    VALUES (d_id, rec.title, meeting_ts, 'historical_backfill_blount_capital')
    ON CONFLICT (deal_id, title, ((meeting_date AT TIME ZONE 'UTC')::date)) DO NOTHING;
  END LOOP;
END $$;

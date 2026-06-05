
DO $mig$
DECLARE
  v_tenant uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  v_created int := 0;
  v_set int := 0;
  v_appended int := 0;
  v_skipped int := 0;
  v_contact_id uuid;
  v_existing text;
  v_first text; v_last text;
  r record;
BEGIN
  CREATE TEMP TABLE _bc_notes(pname text, note text) ON COMMIT DROP;

  INSERT INTO _bc_notes(pname, note) VALUES
  ('Lisa Murgia', $note$Met with Lisa$note$),
  ('Polly TEST', $note$Diligence Documents: 02_Diligence_Working$note$),
  ('Ryan Morgan', $note$Ryan Morgan and JL spoke on 2026.01.26. Ryan building out buy-side acquisition advisory platform, helping entrepreneurs buy companies in the 1-10M EV range. 17 companies currently expected to transact by March of this year. Needs to line up financing for some but also plugged into multiple other deals outside of these 17 — i.e. an OG company that needs 12M of debt financing. Ryan also looking for funding for Acquisition Network itself, his company — currently doing 100k/mo with high expenses, sounds like the company is just south of breakeven. JL and Ryan discussed getting some deals together done on the side on referral to improve his cash flow profile, at which point BCC can help him raise debt financing for Acquisition Network — in other words, Ryan directs a few referral deals at BCC now, in order to get Acquisition Network into a position to itself become a BCC client. GB and JL connected with management on 2026.01.26. Wait and see — unclear if they will need BCC.$note$),
  ('Leroy Glass', $note$Discovery call scheduled with Alex on 2026.01.30. Referred by JL connection, Leroy Glass operates private jet leasing business.$note$),
  ('Taek Wan Kim', $note$JL to review VDR on 2026.01.27 ahead of call later same week. JL prepared engagement proposal on 2026.02.05.$note$),
  ('Bryan Johnson', $note$LinkedIn — Bryan Johnson spoke with JL on 2026.01.28, indicating he got response from Berel (80k followers, impressive). Berel asked for referral fee — JL directed Bryan to tell Berel to begin a potentially very lucrative relationship by BCC giving up a little more.

Mizzen intro to bridge financers? 2026.02.10.

Capitala to think about what bridge intros might make sense here.$note$),
  ('Steve Pontius', $note$NXTMoves — JL VDR review questions/comments across Revenue Performance Overview, Pipeline, 2024 P&L, and NXTMoves Credit Facility.

2026.05.18 held catchup with Steve Nigri — awaiting updated deck, financials and pipeline to turn on debt raise in August, per Steve, which is when he expects they will be in low 7 figures of ARR. NXTMoves connecting with BOB.Ai in coming short days — JL to follow up. JL sent follow-up email requesting latest investor deck, model, YTD financials, pipeline, and sample contracts.

Blount Capital Due Diligence Room (Box).$note$),
  ('Vitaly Pentegrov', $note$JL connected with Vitaly on 2026.01.28 — raising Series A, 9m, needs lead investor and seeking debt too. Wants intro on former and help on latter. Also has friend in EV charging who does 1-3M projects. JL sending NDA and diligence request on 2026.01.28. JL had meeting with Vitaly on 2026.04.16 — sent NDA same day. JL sent information request on 2026.04.22. Setting up catchup for 2026.04.28 12pm ET.

JL sent post-pitch note on 2026.05.05; sent engagement proposal same day. GB sent follow-up on 2026.05.28.$note$),
  ('Mohamed Sameh Shahwan', $note$2 ventures — important export of construction materials. 1.3M rev / 400K EBITDA in 2024; projecting 3.5M rev / 1M EBITDA in 2025. Looking for inventory PO financing to expand business; development of land, 5M needed; getting SBA loans. JL followed up on 2026.03.05. Mohamed responded the timing is too early, not ready until summer. Okay — will reach out in May to touch base.$note$),
  ('Tina Khadivi', $note$2026.01.30 JL materials review notes (Surevix / Project Sea) — transaction and financials diligence questions. Pharma company with one location in Staten Island, ~240M revenue, 15-20M EBITDA. Independent sponsor has LOI for 75M; 2 term sheets from hedge funds with spicy terms. Leaning on BCC to determine if better can be done.

Mizzen interested — include in VDR. Capitala generally doesn't do sponsor-backed but worth a look. Pelham/S2K — perhaps Linden could be interested; product concentration a nonstarter for S2K. Concentric interested, 20M (80/20 — 18M debt / 2M equity), open to a partner, 5.5yr term, all cash pay, 12-13% all in. Commercial Finance Partners very interested.$note$),
  ('Todd Camhe', $note$Oak Proof — JL connected with Todd on 2026.02.03 (raw bourbon barrel purchasing fund). Closing 4M Fund I; launching 40-50M Fund II. Team reconnected 2026.02.10 (time sensitive). JL connected 2026.02.23 — sold the deal; milestone fee set at 35K, 1.5% of 30M commitment. Proposal sent 2026.02.25.

2026.02.23 call notes — collateral/title/storage/contract distillers (Lofted Spirits, Bardstown, Green River, Whiskey House); liquidity and downside detail.

2026.02.25 terms call — 3-5M equity to fund Fund I opex; ~13M acquisition cost for barrels appraised ~21M.

Likely needs a warehouse facility (30M revolver, 60-75% advance on appraised barrel value, bonded warehouse receipts, SPV).$note$),
  ('Albert Lindsell', $note$Club Condor — JL reachout late January 2026: Lewis Pomeroy (Hyndlaand IB, UK), Jeroen Hektor (EY Parthenon, NL), Austin Foster (Arma Partners, London), Damien Miller (Alpha Capital, London) — all interested, will let marinate.

2026.04.02 — JL to update teaser and latest investor list and send by 2026.04.07 ahead of proposed call on 2026.04.08.$note$),
  ('Bertrand Deleuse', $note$JL connected with Bertrand on 2026.02.04 — Water Garden Farms: 6 highly efficient greenhouse facilities, ~100M each. Near-term 100M WV facility plus 2 TX facilities. JL sending diligence request 2026.02.04; emailed 2026.02.16; team connected 2026.02.19 (met Dennis). Proposal sent 2026.02.23; follow-up 2026.02.25. Committed to working with BCC on 2026.03.09 (give 30-45 days). JL followed up via text 2026.04.07.

Also to farm WGF investors from Bertrand for EVRNU. 2026.02.19 JL materials production review (pilot, value prop, customers, construction/ops, financials, transaction). Terms call notes (6-7yr, 8% bank rate, 70 LTV, Macquarie ~65M). JL followed up 2026.03.03.$note$),
  ('Greg Doutre', $note$Priority Capital — JL floated in coffee chat on 2026.02.04; Jace suggested may be interesting. JL to share materials when ready.$note$),
  ('navtej shanker', $note$UCEA — GB & JL caught up with UCEA on 2026.02.05. Need events financing; 15-20K retainer upfront willing to pay. JL sent diligence request 2026.02.05; followed up 2026.02.22.

Some interest from Mizzen capital.$note$),
  ('Brandon Seifert', $note$EVRNU — 2026.02.09 go-to-market thoughts (value prop, alternative uses, current transaction seeking 50M / 30M USDA secured, merits, considerations). 2026.02.18 USDA term sheet call thoughts and questions. Enhanced Capital — sustainable infra finance, tax credits, opportunity zones; Josh letting it marinate. 2026.03.23 EVRNU outreach email (to Emily). 2026.03.25 weekly meeting questions. 2026.03.02 diligence call — term sheets, intangible assets as collateral, working capital reserves, covenant-free window, 17kpta vs 3kpta quality/pricing.

Water Garden Farms lenders: Goldman Sachs, Macquarie, Reboot Capital, Eire Street, Essex, SX Capital, Texas Dept of Ag, ASI Infrastructure, Allshore Partners.$note$),
  ('Jefferson Tingey', $note$Mizzen interested. 2.0x leverage, personal guarantee.

Capitala: SOFR + 5.50%, 750/850, 5-year, 5% or less amortization — open to learning more.

S2K — reimbursement risk and no sponsor cash equity contribution. Concentric — concerned about misalignment given lack of cash equity but may have ideas re others; let it marinate. Commercial Finance Partners — very interested, want to learn more; set up follow-up call with client once engaged.$note$),
  ('Danny Chen', $note$JL spoke with founder on 2026.02.10 — nothing to do here, too small, too early, but may make some VC intros for the guy.$note$),
  ('Yarin Shahbar', $note$Connected on 2026.02.11 — property refi. JL followed up on 2026.03.05 re RE opportunity; proposed setting up a time with Managing Partner and RE specialist.$note$);

  FOR r IN SELECT pname, note FROM _bc_notes LOOP
    SELECT id, description INTO v_contact_id, v_existing
      FROM public.contacts
     WHERE org_company_id = v_tenant
       AND btrim(full_name) ILIKE btrim(r.pname)
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1;

    IF v_contact_id IS NULL THEN
      IF position(' ' in r.pname) > 0 THEN
        v_first := split_part(r.pname, ' ', 1);
        v_last  := btrim(substring(r.pname from position(' ' in r.pname) + 1));
      ELSE
        v_first := r.pname; v_last := NULL;
      END IF;
      INSERT INTO public.contacts(id, org_company_id, first_name, last_name, description, created_at, updated_at)
      VALUES (gen_random_uuid(), v_tenant, v_first, v_last, r.note, now(), now())
      RETURNING id INTO v_contact_id;
      v_created := v_created + 1;
      CONTINUE;
    END IF;

    IF v_existing IS NULL OR btrim(v_existing) = '' THEN
      UPDATE public.contacts SET description = r.note, updated_at = now() WHERE id = v_contact_id;
      v_set := v_set + 1;
    ELSIF position(r.note in v_existing) > 0 THEN
      v_skipped := v_skipped + 1;
    ELSE
      UPDATE public.contacts
         SET description = v_existing || E'\n\n' || r.note,
             updated_at = now()
       WHERE id = v_contact_id;
      v_appended := v_appended + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Tenant: %', v_tenant;
  RAISE NOTICE 'Contacts created: %', v_created;
  RAISE NOTICE 'Notes set on empty: %', v_set;
  RAISE NOTICE 'Notes appended: %', v_appended;
  RAISE NOTICE 'Already contained (skipped): %', v_skipped;
END
$mig$;

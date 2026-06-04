DO $$
DECLARE
  bc_id uuid;
  crm_co_id uuid;
BEGIN
  SELECT id INTO bc_id FROM public.companies WHERE name = 'Blount Capital' LIMIT 1;
  IF bc_id IS NULL THEN
    RAISE NOTICE 'Blount Capital company not found';
    RETURN;
  END IF;

  -- 1. Wells Fargo
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Wells Fargo%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Met with Lisa$n$, now(), 'native');
  END IF;

  -- 2. Blount Capital Consulting
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND (name ILIKE '%Blount Capital Consulting%' OR name ILIKE '%Blount Consulting%') LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Diligence Documents 02DiligenceWorking. 2026.02.27 JL prepared fundraising deck. sigular guff not a fit but will put in some thought to see who might be.$n$, now(), 'native');
  END IF;

  -- 3. Acquisition Network
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Acquisition Network%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Ryan Morgan and JL spoke on 2026.01.26. Ryan building out buy-side acquisition advisory platform, helping entrepreneurs buy companies in the 1-10M EV range. 17 companies currently expected to transact by March of this year. Needs to line up financing for some but also plugged into multiple other deals outside of these 17 i.e. an OG company that needs 12M of debt financing. Ryan also looking for funding for Acquisition Network itself, his company - currently doing 100kmo with high expenses, sounds like the company is just south of breakeven. JL and Ryan discussed getting some deals together done on the side on referral to improve his cash flow profile, at which point BCC can help him raise debt financing for Acquisition Network in other words, Ryan directs a few referral deals at BCC now, in order to get Acquisition Network into a position to itself become a BCC client. GB and JL connected with management on 2026.01.26. Wait and see - unclear if they will need BCC.$n$, now(), 'native');
  END IF;

  -- 4. Aurelux
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Aurelux%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Discovery call scheduled with Alex on 2026.01.30. Referred by JL connection, Leroy Glass operates private jet leasing business.$n$, now(), 'native');
  END IF;

  -- 5. Insignary
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Insignary%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL to review VDR on 2026.01.27 ahead of call later same week. JL prepared engagement proposal on 2026.02.05.$n$, now(), 'native');
  END IF;

  -- 6. Wealthy Executive / Globe Metals
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND (name ILIKE '%Wealthy Executive%' OR name ILIKE '%Globe Metals%') LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$(2) Post | Feed | LinkedIn Berel Solomon | LinkedIn Bryan Johnson spoke with JL on 2026.01.28, indicating he got response from Berel 80k followers, impressive. Berel asked for referral fee - JL directed Bryan to tell Berel 10 begin a potentially very lucrative relationship for him by BCC giving up a little more. JL sent email to Prashanna pt@globemetal.com on 2026.01.29. Prashanna replied on 2026.01.29 with one pager on deal. JL suggested call 1st week of february to discuss. JL connected with Jonathan, CFO, of Globe Metals on 2026.02.02. Sent diligence request same day. JL to discuss with GB re how to finance. JL connected with Greg Doutre Priority Capital on 2026.02.03 - suggested may be of interest. BCC to share materials and VDR access with Greg 2nd week of February. JL followed up with Jonathan on 2026.02.09 - to execute NDA later today, JL mentioned couple mezzanine lenders may be interested. JL followed up again on 2026.03.05. 2026.02.02 Call Notes: RBC Transaction based financing. Dont rely on revolving line of credit. Max loan of 8m. And have receivables finance of 13M. 19m drawn between the two. 20M 15M Inventory 25M AR - very current - all EDC insured, export development. All works from PO of client 5M order. Retained earnings is 12M. 2026 projections 142M canadian and bottom line just under 5M. Tariff expense. Mizzen intro to bridge financers? 2026.02.10. Capitala to think about what bridge intros might make sense here.$n$, now(), 'native');
  END IF;

  -- 7. NXTMoves
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%NXTMoves%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL VDR Review - Questions & Comments: Please elaborate how much of the improvement in effective yield from 2.0 to 2.5 from 2026 to 2028 comes from price kickers clearly enshrined in contracts now being signed? Can you explain a bit more about how you expect to increase share of wallet with customers over the 2026 through 2028 period? Why are you still projecting top customer as a third of revenue in 2028? what kind of logo and dollar churn does your model through 2028 assume? what are the rough splits re uses of capital pertaining to this raise? Have you run into any network bandwidth or other capacity related issues? can you explain a bit more specifically about why the large customer churned last year? Pipeline: are 2026 signed pipeline numbers as good as 100 locked? 2024 PL Big number for contractors. NXTMoves Credit Facility: Elaborate on the role of NXTMoves Capital. 2026.05.18: held catchup with Steve Nigri awaiting updated deck, financials and pipeline to turn on debt raise in August. NXTMoves connecting with BOB.Ai in coming short days. Model: So there are a few revenue streams, this annual fee for new accounts, late fees, interchange revenue, finance charges. Credit Facility Term Sheets: How are you thinking about sequencing corporate operating debt raise versus the receivables facility? Blount Capital Due Diligence Room Powered by Box. Route 2 Recommended by Kevin Speight at Plexus. Gemini Investors potentially interested, would like to learn more.$n$, now(), 'native');
  END IF;

  -- 8. UrbanChain
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%UrbanChain%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL connected with Vitaly on 2026.01.28 - raising Series A, 9m, needs lead investor and seeking debt too. Wants intro on former and help on latter. Also has friend in EV charging who does 1-3M projects. JL sending NDA and diligence request on 2026.01.28 and setting up 2 calls with Vitaly and friend. JL had meeting with Vitaly Devocion on 2026.04.16 - sent NDA same day. JL sent information request to Vitaly on 2026.04.22 - awaiting response. Setting up catchup for 2026.04.28 12pm ET. JL sent note on 2026.05.05 post-pitch. JL sent engagement proposal same day. GB sent follow up on 2026.05.28.$n$, now(), 'native');
  END IF;

  -- 9. Texco
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Texco%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$2 ventures: Important export of construction materials. 1.3M rev / 400K EBITDA in 2024. projecting 3.5M rev / 1M EBITDA in 2025. looking for inventory PO financing to expand business. Development of land, 5M needed. Getting SBA loans. Wants us to look at term sheets. JL followed up on 2026.03.05. Mohamed responded - The timing is a bit early now, i am not ready to discuss further till the summer probably. Okay great. we will reach out in May to touch base.$n$, now(), 'native');
  END IF;

  -- 10. Oak Proof
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Oak Proof%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Oak Proof Fund I, LP - JL connected with Todd on 2026.02.03 - Todd running a raw bourbon barrel purchasing fund. hold barrels as they age and sells them to bourbon brands in partnership with distilleries. he is a GP, gets a 2/20. Todd suggesting it is time to strike in the market. supply is getting cut significantly faster than demand is pulling back. Todds base case model is a high-20s IRR. He is now closing up 4M Fund I and looking to launch 40-50M fund II. has been able to get 75 advances on appraised value of barrels at 14-15 rate. Team reconnected on 2026.02.10 - Time sensitive. JL connected with Todd on 2026.02.23 - sold the deal. Milestone fee of 30-40K. Will set at 35K. 1.5 of total commitment, 30M. JL sent proposal on 2026.02.25. JL followed up on 2026.03.03. JL followed up via text on 2026.03.05. 2026.02.23 Call Notes: Collateral - auditor in kentucky, blue and co. annual appraisals. Title - lender gets lien on the title of the barrels. all barrels in an SPV. Storage - only acquiring barrels from handful of top distillers. fully insured, federally bonded. Contract Distillers: Lofted Spirits, Bardstown Bourbon Co, Green River and Whiskey House. Todd likely needs a warehouse facility 30M Revolver. Advance rates 60-75 of appraised barrel value. 2026.02.25 Terms Call: 3-5M of equity to fund opex in fund I. Itll be about 13M in acquisitions costs for all of the barrels that will be appraised at 21M. Questions for Todd: 10 high-value questions covering collateral valuation, title and collateral control, storage and insurance, exit liquidity, historical performance, barrel supply relationships, demand risk, aging economics, advance rate justification, downside scenario.$n$, now(), 'native');
  END IF;

  -- 11. Club Condor
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Club Condor%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL Reachout Late January 2026: Lewis Pomeroy, Founding Partner, Hyndlaand IB, UK-based - 2026.02.04 - interested. Jeroen Hektor, Manager, EY Parthenon IB division, NL - 2026.01.23 - interested. Austin Foster, VP, Arma Partners IB, London - 2026.01.26 - interested. Damien Miller, MP Alpha Capital Fund Manager, London - 2026.01.22. 2026.04.02 JL to update teaser and latest investor list and send by 2026.04.07, ahead of proposed call on 2026.04.08.$n$, now(), 'native');
  END IF;

  -- 12. Water Garden
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Water Garden%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL connected with Bertrand on 2026.02.04 - looking to build 6 highly efficient greenhouse facilities across US, each 100M or so, addressing water shortage problems. Total opp over next few years, 600M. Near-term, 100M existing facility in West Virginia. JL sent diligence request on 2026.02.04. JL sent email on 2026.02.16. Team connected on 2026.02.19 - met Dennis. Great call. JL sent proposal on 2026.02.23. JL followed up on 2026.03.03 - we believe! Call on 2026.03.09 - committed to working with you guys. Give us 30-45 days. JL followed up via text on 2026.04.07. JL followed up on 2026.03.03. 2026.02.19 JL Materials Production Review: Pilot questions, Value Proposition, Customers, Construction/Operations/Employees, Financials, Transaction questions. Teaser Overview: Company developing ultra-efficient, AI-enabled, automated U.S. greenhouses producing organic leafy greens at 10M lbs annually. EBITDA of 37.6M on 59.3M Revenue in Year 1. 60 EBITDA margins at maturity. Terms: 6-7 year rate, 8 rate from banks, timing is more important than pricing, 70 LTV, macquaire saying they can get to 65M. Lenders: goldman sachs, macquarie, reboot capital, Eire Street, Essex, SX Capital, Texas Dept of Ag, ASI Infrastructure, Allshore Partners. JL to farm WGF investors from Bertrand Deleuse. JL to set up convo with JP head of Sustainability Asset Management.$n$, now(), 'native');
  END IF;

  -- 13. Priority Capital
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Priority Capital%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL floated in coffee chat on 2026.02.04 - Jace suggested may be interesting. JL to share materials when ready.$n$, now(), 'native');
  END IF;

  -- 14. UCEA
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%UCEA%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$GB JL caught up with UCEA on 2026.02.05. Need events financing. 15-20K retainer upfront willing to pay. JL sent diligence request on 2026.02.05. JL followed up on 2026.02.22 to set up time to discuss. Some interest from Mizzen capital.$n$, now(), 'native');
  END IF;

  -- 15. Optivide
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Optivide%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL spoke with founder on 2026.02.10 - nothing to do here, too small, too early, but may make some VC intros for the guy.$n$, now(), 'native');
  END IF;

  -- 16. Frontier Capital
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Frontier Capital%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Connected on 2026.02.11 - property refi. JL followed up on 2026.03.05 - great connecting a few weeks ago. how are things going? confident we could be supportive and position you exceptionally well, we have deep RE fundraising expertise on our bench.$n$, now(), 'native');
  END IF;

  -- 17. RxEbate
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%RxEbate%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$Mizzen interested. 2.0x leverages, personal guarantee. Capitala SOFR 5.50 750-850 5-year, 5 or less amortization, open to learning more. S2K - reimbursement risk and no sponsor cash equity contribution. Pelham S2K only does sponsor backed deals, no concentration, really doesnt like consumer or HC or reimbursement. Concentric concerned about misalignment given lack of cash equity but may have some ideas. Commercial Finance Partners - very interested want to learn more, set up follow up call with client once engaged.$n$, now(), 'native');
  END IF;

  -- 18. Morfeu
  SELECT id INTO crm_co_id FROM public.crm_companies WHERE org_company_id = bc_id AND name ILIKE '%Morfeu%' LIMIT 1;
  IF crm_co_id IS NOT NULL THEN
    INSERT INTO public.crm_company_activities (crm_company_id, activity_type, subject, body, occurred_at, source)
    VALUES (crm_co_id, 'note', 'Imported Note', $n$JL connected with founder on 2026.02.12 - raising 2M round for video content creation b2b b2c company. raised 1M from turkish fund. open to nondilutive options for remaining 1M. JL thinks could be big. this founder already had 1 successful exit. smart guy. J$n$, now(), 'native');
  END IF;
END $$;
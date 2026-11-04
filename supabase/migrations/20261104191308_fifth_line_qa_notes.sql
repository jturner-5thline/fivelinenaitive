CREATE OR REPLACE FUNCTION public.fifth_line_qa_note_template() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $f$ SELECT $tpl$<h2>Pre-Kick Off Q&amp;A Email</h2>
<ul>
<li><p>How much of your revenue is generated within the US or Canada? How much outside the US and Canada?</p></li>
<li><p>Who is your law firm?</p></li>
<li><p>Who are your top 3 competitors?</p></li>
<li><p>How many customers do you currently have?</p></li>
<li><p>Any major concentration to be aware of?</p></li>
<li><p>Who is your bank?</p></li>
<li><p>What accounting system do you currently use?</p></li>
<li><p>Have you ever gone through an audit? If so, what years?</p></li>
<li><p>Are your financials CPA-Reviewed?</p></li>
<li><p>Who was the auditing firm?</p></li>
<li><p>Who's your accounting firm / CPA?</p></li>
<li><p>Is the CFO Full-time or contract?</p></li>
<li><p>Total headcount – including FTE and contractors</p></li>
<li><p>Is the headcount mostly located in the US?</p></li>
<li><p>Where is management located? (Country / State)</p></li>
<li><p>Is the software installed on customers premise or is it a cloud-based offering?</p></li>
<li><p>Please confirm what items are allocated to COGS in your financials</p></li>
<li><p>Total Capital Raised to Date (Equity &amp; Convertible Notes)</p></li>
<li><p>Most recent raise</p><ul><li><p>Amount, Valuation &amp; Structure</p></li></ul></li>
<li><p>How many board seats do you currently have?</p></li>
<li><p>How many are filled?</p></li>
<li><p>Who sits on the board?</p></li>
<li><p>What does a likely exit look like? Who's a likely acquirer? (Strategic, PE, etc.) – what sort of valuations have been discussed for an exit internally?</p></li>
</ul>
<h3>Revenue</h3>
<ul>
<li><p>*Walk me through the revenue streams, what they are and what the contract structure is with clients</p></li>
<li><p>*How do customers pay? Upfront, monthly, in arrears?</p></li>
<li><p>What are your typical contract structures (e.g., annual, multi-annual) and payment terms (e.g., monthly, annually)</p></li>
<li><p>Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>The Raise</h3>
<ul>
<li><p>*Have you run a debt process at all in the past couple of years, with non-bank lenders? As in, have lenders reviewed your information at all over the past couple of years? If so, who were they?</p></li>
<li><p>Is Management and the board all on the same page with regards to exploring debt?</p></li>
<li><p>*What is the true GOALs in the financing? Insurance, preserve equity – cost? Flexibility? – it allows us to be most targeted in our reviews</p></li>
<li><p>*What is the breakdown of use of funds? (est.)</p></li>
</ul>
<h3>The Company &amp; the Market</h3>
<ul>
<li><p>When you lose a client, either a lost sale or a lost account, what is the typical reason?</p></li>
<li><p>When you win against competitors, what is the primary reason you win?</p></li>
<li><p>Pass me all of the relevant contact information for folks in your company</p></li>
</ul>
<h3>Cap Structure &amp; Investors</h3>
<ul>
<li><p>*Do investors have appetite to fund the company in additional rounds?</p></li>
<li><p>*Do the investors have the ability to fund the company if needed?</p></li>
</ul>
<h3>Customers</h3>
<ul>
<li><p>*Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>Finance &amp; Metrics</h3>
<ul>
<li><p>*Who is your bank?</p><ul><li><p>Do you need a referral?</p></li></ul></li>
<li><p>*What are the primary KPI's you track for the business?</p><ul><li><p>Are they improving?</p></li></ul></li>
<li><p>*How long have you been with the company?</p></li>
<li><p>*In a downside scenario, which expenses (if any) can the company reduce to reach breakeven?</p></li>
<li><p>*Do you have a pipeline that supports your projections?</p></li>
<li><p>*Walk me through any seasonality to your sales cycles</p></li>
<li><p>Walk through any Flags from the analysis</p><ul><li><p></p></li></ul></li>
</ul>
<h3>Tech Kick off Questions</h3>
<ul>
<li><p>Do customers pay a fixed-fee or usage-based fee?</p></li>
<li><p>Are contracts annual? Multi-year? Monthly? If a mix, what's the rough mix?</p></li>
<li><p></p></li>
</ul>
<h3>Non-Tech Kick off Questions</h3>
<ul>
<li><p>*Any major customer concentration to be aware of, consistently throughout the year?</p></li>
<li><p>*What is your deposit &amp; payment schedule with your customers?</p></li>
<li><p>*Any challenges in collecting, historically?</p></li>
<li><p></p></li>
<li><p>INVENTORY what inventory system do you use?</p></li>
<li><p>INVENTORY What is the typically turnover time for your inventory?</p></li>
<li><p>INVENTORY What is the standard contract length/structure with your customers? What term?</p></li>
<li><p>*INVENTORY Have you ever had an inventory or equipment appraisal?</p></li>
<li><p>INVENTORY (if so) When was the most recent appraisal on your inventory or equipment?</p></li>
<li><p>INVENTORY Where are your vendors located? US or internationally? What's the rough breakdown in %</p></li>
<li><p>INVENTORY and your other payment terms with them?</p></li>
<li><p>INVENTORY Do you sell through any distributors to your customers? If so, how many distributors and what is the general breakdown of cash/revenue that flows through them?</p></li>
<li><p>INVENTORY How far out in your forecast provided is your revenue "locked in"? meaning you have either contracts or have worked with your customers on order schedules of some sort? Rough est. is fine</p></li>
</ul>$tpl$::text $f$;
CREATE OR REPLACE FUNCTION public.seed_fifth_line_qa_note() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
BEGIN
  IF NEW.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND NOT EXISTS (SELECT 1 FROM deal_space_notes WHERE deal_id=NEW.id AND template_name='pre_kickoff_qa_email') THEN
    INSERT INTO deal_space_notes(deal_id,user_id,title,content,template_name,is_shared) VALUES (NEW.id,NEW.user_id,'Q&A Notes',public.fifth_line_qa_note_template(),'pre_kickoff_qa_email',true);
  END IF;
  RETURN NEW;
END $f$;
REVOKE EXECUTE ON FUNCTION public.seed_fifth_line_qa_note() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_seed_fifth_line_qa_note ON public.deals;
CREATE TRIGGER trg_seed_fifth_line_qa_note AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.seed_fifth_line_qa_note();
INSERT INTO public.deal_space_notes(deal_id,user_id,title,content,template_name,is_shared)
SELECT d.id,d.user_id,'Q&A Notes',public.fifth_line_qa_note_template(),'pre_kickoff_qa_email',true FROM public.deals d
WHERE d.id IN ('67c84915-ab07-4e75-a4ad-aa8ce7cddfab','285820ca-eebe-405d-8b84-e776e84ff47b','2ce45437-5c05-4843-b49d-29ce45de95cf','9f6eb708-e767-4f50-83bd-fc573e508265','844af264-61dd-44d1-8f88-4be96278e524','92c8484e-7dc5-487f-b984-c1013ccf5786','c2db0e60-2dbc-4c18-abf0-b97e0231b3b3','00de60f5-ef63-4c5f-a3fb-1a4f0393716d','54144cb1-f89f-423b-9a47-847542439d01','b624a054-74ae-4a71-a74d-e59062e85863','a844aa7c-2f75-4364-a41e-41526814f6ec','f0de2508-7d8e-4685-9d3f-087c6f42a202') AND NOT EXISTS (SELECT 1 FROM public.deal_space_notes n WHERE n.deal_id=d.id AND n.template_name='pre_kickoff_qa_email');

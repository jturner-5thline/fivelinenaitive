
DO $$
DECLARE
  cid uuid := '44556c46-9127-4b12-b14e-d6fee784afcf';
  uid uuid := 'a6b48ccd-0f2a-4018-886e-241287208ea0';
  months text[] := ARRAY['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
                         '2027-01','2027-02','2027-03','2027-04','2027-05','2027-06',
                         '2027-07','2027-08','2027-09','2027-10','2027-11','2027-12'];
  labels jsonb := '{
    "deals-on-board":"Deals on the Board (#)",
    "deals-on-board-value":"Deals on the Board ($)",
    "proposals-issued":"Proposals Issued",
    "dollars-proposed":"Dollars Proposed",
    "clients-signed":"Clients Signed",
    "dollars-signed":"Dollars Signed",
    "clients-receiving-terms":"Clients Receiving Terms",
    "terms-signed":"Terms Signed",
    "volume-of-terms-signed":"Volume of Terms Signed",
    "deals-closed":"Deals Closed",
    "dollars-funded":"Dollars Funded",
    "total-revenue":"Total Revenue",
    "retainer-revenue":"Retainer Revenue",
    "consulting-milestone-revenue":"Consulting / Milestone Revenue",
    "fee-revenue":"Fee Revenue"
  }'::jsonb;
  plan_data jsonb := '{
    "deals-on-board":               [2,2,2,0,2,2,2,2,2,2,2,2,2,2,2,0,0,0],
    "deals-on-board-value":         [11900000,14300000,14300000,0,5900000,14300000,17800000,23800000,17800000,23800000,17800000,17800000,23800000,17800000,23800000,0,0,0],
    "proposals-issued":             [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    "dollars-proposed":             [9900000,9900000,11900000,11900000,0,5000000,11900000,14900000,19800000,14900000,19800000,14900000,14900000,19800000,14900000,19800000,0,0],
    "clients-signed":               [0,1,1,1,1,0,1,2,2,2,2,2,2,2,2,2,2,0],
    "dollars-signed":               [0,10000000,10000000,12000000,12000000,0,5000000,12000000,15000000,20000000,15000000,20000000,15000000,15000000,20000000,15000000,20000000,0],
    "clients-receiving-terms":      [2,2,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    "terms-signed":                 [2,2,2,0,2,2,2,2,0,1,2,3,4,3,4,3,3,4],
    "volume-of-terms-signed":       [6000000,6000000,6000000,0,5000000,5000000,6000000,6000000,0,2500000,6000000,7500000,10000000,7500000,10000000,7500000,7500000,10000000],
    "deals-closed":                 [4,2,4,0,0,1,1,1,2,2,0,1,2,3,3,3,3,2],
    "dollars-funded":               [5800000,9900000,5400000,5400000,5400000,0,4500000,4500000,5400000,5400000,0,2300000,5400000,6800000,9000000,6800000,9000000,6800000],
    "total-revenue":                [194000,307500,145000,35000,85000,25000,147500,132500,180000,180000,45000,101250,180000,213750,270000,213750,270000,193750],
    "retainer-revenue":             [0,10000,10000,10000,10000,0,10000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000],
    "consulting-milestone-revenue": [50000,50000,0,25000,25000,25000,25000,0,25000,25000,25000,25000,25000,25000,25000,25000,25000,25000],
    "fee-revenue":                  [144000,247500,135000,0,50000,0,112500,112500,135000,135000,0,56250,135000,168750,225000,168750,225000,148750]
  }'::jsonb;
  wkey text;
  arr jsonb;
  i int;
BEGIN
  FOR wkey, arr IN SELECT key, value FROM jsonb_each(plan_data)
  LOOP
    FOR i IN 0..17 LOOP
      INSERT INTO public.insights_metric_targets (company_id, owner_user_id, metric_key, metric_label, period_month, target_value)
      VALUES (cid, uid, 'plan:sales-dashboard-v2:' || wkey, labels->>wkey, months[i+1], (arr->>i)::numeric)
      ON CONFLICT (company_id, metric_key, period_month)
      DO UPDATE SET target_value = EXCLUDED.target_value, metric_label = EXCLUDED.metric_label, updated_at = now();
    END LOOP;
  END LOOP;
END $$;

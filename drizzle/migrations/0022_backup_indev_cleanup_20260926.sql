CREATE SCHEMA IF NOT EXISTS archive;
CREATE TABLE archive._indev_cleanup_deals_20260926 AS SELECT * FROM public.deals WHERE pipeline_id='40b17dfb-9122-49e0-bf7c-5aa993d5d615' AND stage IN ('Nurturing','Company Opted Out','Past Client','Active Client','Not a Fit; Do Not Contact','Client Lost','Form Pending','Unqualified','On Hold','No Lender Interest');
CREATE TABLE archive._indev_cleanup_stage_history_20260926 AS SELECT h.* FROM public.deal_stage_history h WHERE h.deal_id IN (SELECT id FROM archive._indev_cleanup_deals_20260926);
CREATE TABLE archive._indev_cleanup_activity_20260926 AS SELECT a.* FROM public.deal_activity a WHERE a.deal_id IN (SELECT id FROM archive._indev_cleanup_deals_20260926);
CREATE TABLE archive._indev_cleanup_deal_lenders_20260926 AS SELECT l.* FROM public.deal_lenders l WHERE l.deal_id IN (SELECT id FROM archive._indev_cleanup_deals_20260926);
REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM anon, authenticated;
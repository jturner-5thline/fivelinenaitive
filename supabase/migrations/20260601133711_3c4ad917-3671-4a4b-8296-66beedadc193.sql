-- Historical stage history import: Batch 1 (rows 2-51, 5th Line) — run_id=historical_import_5th_line_2026_06_01
BEGIN;

-- 58 inserts into deal_stage_history
INSERT INTO public.deal_stage_history (deal_id, company_id, pipeline_id, to_stage, to_stage_id, to_stage_label_raw, changed_at, source, event_type) VALUES
('c1924090-4374-4fe2-b220-695c18c1f559','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('65d14f8a-bb6d-4f1b-aec6-d9c2b9cfc4ed','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('927ac912-5c6d-4445-8de8-84d3ccdf58b9','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('00dfb4fe-8284-4bad-866c-8c7a3243c0f2','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Initial Lender Review','initial-lender-review','Initial Lender Review','2023-08-31 16:00:00+00','historical_import','stage_enter'),
('00dfb4fe-8284-4bad-866c-8c7a3243c0f2','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','NDA/Needs List Sent','ndaneeds-list-sent','NDA/Needs List Sent','2023-08-29 16:00:00+00','historical_import','stage_enter'),
('00dfb4fe-8284-4bad-866c-8c7a3243c0f2','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Pre-Credit Needs','pre-credit-needs','Pre-Credit Needs','2023-08-30 16:00:00+00','historical_import','stage_enter'),
('00dfb4fe-8284-4bad-866c-8c7a3243c0f2','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Proposal In Development','proposal-in-development','Proposal In Development','2023-08-31 16:00:00+00','historical_import','stage_enter'),
('593eaf59-d35c-4a34-b1ea-db4b1ba3b088','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('a9b6f846-89f3-4e8f-9afe-d2d404f9456e','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('f1d43bd5-266d-46f1-93dc-9f66102ab05d','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Initial Lender Review','initial-lender-review','Initial Lender Review','2023-04-18 16:00:00+00','historical_import','stage_enter'),
('f1d43bd5-266d-46f1-93dc-9f66102ab05d','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','NDA/Needs List Sent','ndaneeds-list-sent','NDA/Needs List Sent','2023-03-17 16:00:00+00','historical_import','stage_enter'),
('f1d43bd5-266d-46f1-93dc-9f66102ab05d','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Pre-Credit Needs','pre-credit-needs','Pre-Credit Needs','2023-04-14 16:00:00+00','historical_import','stage_enter'),
('f1d43bd5-266d-46f1-93dc-9f66102ab05d','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Proposal In Development','proposal-in-development','Proposal In Development','2023-04-20 16:00:00+00','historical_import','stage_enter'),
('f1d43bd5-266d-46f1-93dc-9f66102ab05d','44556c46-9127-4b12-b14e-d6fee784afcf','b78ad452-b489-4c89-8a91-789347c05f79','Proposal Issued','proposal-issued','Proposal Issued','2023-04-20 16:00:00+00','historical_import','stage_enter'),
('a745acaa-71cd-4928-aded-4b4b4b6927de','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('84c5a3ec-999a-4bc4-852e-0c7b049cd74d','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('9d1e1a04-36b5-476c-9cfe-0e9441f3bb43','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('42e0dc8f-a71e-4fdb-b6c0-41354eb0361e','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('739d54e1-ef53-4ddd-812a-75fe559bd9e6','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('104c7d32-4cff-4b3e-a36f-66b13148997d','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('593af76a-af4c-4dae-8705-7f8fdcdc3e6f','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('05c1c51e-4355-43b6-b7d8-8a9d43036153','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('f1acff87-cf3d-486a-8aa6-7def2e30d1b1','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('d9c01e58-79e0-48ea-b217-a609576eae80','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('757131ae-2d6c-44ef-9e66-531b30730a36','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter'),
('f26ca0c2-8ef0-4008-a0b7-d913d3c2a212','44556c46-9127-4b12-b14e-d6fee784afcf','40b17dfb-9122-49e0-bf7c-5aa993d5d615','Unresponsive','on-hold','Unresponsive','2022-11-29 17:00:00+00','historical_import','stage_enter');

-- The remaining inserts + overwrites + audit rows continue in this same transaction via subsequent statements below.

-- INSERTS continued (rows 27+ of to_insert)
INSERT INTO public.deal_stage_history (deal_id, company_id, pipeline_id, to_stage, to_stage_id, to_stage_label_raw, changed_at, source, event_type)
SELECT v.deal_id::uuid, '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid, v.pipeline_id::uuid, v.label, v.stage_id, v.label, v.changed_at::timestamptz, 'historical_import', 'stage_enter'
FROM (VALUES
  ('8f9a3fa8-d473-4639-a6d5-3baf86bba21f','40b17dfb-9122-49e0-bf7c-5aa993d5d615','on-hold','Unresponsive','2025-08-21 16:00:00+00'),
  ('467e1a50-1234-0000-0000-000000000000','b78ad452-b489-4c89-8a91-789347c05f79','ndaneeds-list-sent','NDA/Needs List Sent','2023-03-23 16:00:00+00'),
  ('467e1a50-1234-0000-0000-000000000000','b78ad452-b489-4c89-8a91-789347c05f79','initial-lender-review','Initial Lender Review','2023-04-25 16:00:00+00')
) AS v(deal_id, pipeline_id, stage_id, label, changed_at)
WHERE FALSE; -- placeholder; real PacketFabric uuid resolved below

ROLLBACK; -- abort: placeholder migration, see follow-up
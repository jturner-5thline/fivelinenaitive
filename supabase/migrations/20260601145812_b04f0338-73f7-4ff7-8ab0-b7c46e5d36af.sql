DO $$
DECLARE
  v_pipeline UUID := '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
  v_src TEXT := 'historical_import_5th_line_2026_06_01_batch3';
  v_inserts INT := 0; v_updates INT := 0;
  r RECORD; v_existing UUID;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('c559c82c-bd59-43b3-871e-d467e679a03e'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('29569087-453b-498c-a763-84750200ae2a'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('224db2e7-83e5-4154-9cee-8e7cf9648e13'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('ca842a13-c7e0-462f-bb37-7f46fba7ecdb'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('ca842a13-c7e0-462f-bb37-7f46fba7ecdb'::uuid,'closed-won','Indication of Interest','2022-11-29T17:00:00Z'::timestamptz),
    ('ca842a13-c7e0-462f-bb37-7f46fba7ecdb'::uuid,'ndaneeds-list-sent','Client Paused Deal','2023-02-01T17:00:00Z'::timestamptz),
    ('5b6822b9-4d29-4013-9c4c-e05bf48a8de5'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('db1c23dd-9060-4ef2-b433-96757bc3d3b0'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('3977d5e7-210d-4a46-961e-27bd04140ebd'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('be5e2bbd-76b3-4d10-bbfd-4e20a4ef39b1'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('be5e2bbd-76b3-4d10-bbfd-4e20a4ef39b1'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('0b7cd580-cf05-419f-ad5c-0dd4c97a9541'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('0b7cd580-cf05-419f-ad5c-0dd4c97a9541'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('0b7cd580-cf05-419f-ad5c-0dd4c97a9541'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('1f79262c-5465-4ad2-a73d-babbfbf408d4'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('1f79262c-5465-4ad2-a73d-babbfbf408d4'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('6d414b40-703a-4b7d-a9cc-0839edcdc087'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('c642564d-b40e-4159-aaa7-1259f450bb59'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('c642564d-b40e-4159-aaa7-1259f450bb59'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('62d7a08b-2f3f-4bfa-8f89-c4f6da4b1a1c'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('62d7a08b-2f3f-4bfa-8f89-c4f6da4b1a1c'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('62d7a08b-2f3f-4bfa-8f89-c4f6da4b1a1c'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('22363a49-62dc-4dbe-b643-19712f4f6584'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('bc03fe89-256f-4aaf-9eb9-4013951ee6b6'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('bc03fe89-256f-4aaf-9eb9-4013951ee6b6'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('bc03fe89-256f-4aaf-9eb9-4013951ee6b6'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('470eaa26-a97d-4ac2-99fb-3e94336af1de'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('0a0f14c7-3e37-4280-81f2-f135fdc0abaa'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('9de345fa-ebba-4ef6-bbcd-069ada5d6a75'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('9abfc73d-51ab-4fae-901d-38d77a7972b3'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('9abfc73d-51ab-4fae-901d-38d77a7972b3'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('9abfc73d-51ab-4fae-901d-38d77a7972b3'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('4a23488b-1b64-4b8f-9c29-0b1d2744b5a1'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('4a23488b-1b64-4b8f-9c29-0b1d2744b5a1'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('e3261cbb-e6df-4a75-8b00-f3f3a205c856'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('e7d107ff-d4ec-45c8-87bf-82aed7be0d81'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('a2f87d3f-ee10-410d-ac5d-779d0a6bca00'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('1933e283-a8be-48b6-9ae5-ae47f4315133'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('cbe19254-cd49-4272-af4c-972f0ef87f8e'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('cbe19254-cd49-4272-af4c-972f0ef87f8e'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('cbe19254-cd49-4272-af4c-972f0ef87f8e'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('32c8920a-e7ec-4b0f-b92b-7760a6af7f3e'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('ceba190e-d4b4-4c67-8db2-26540b3036e3'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('ceba190e-d4b4-4c67-8db2-26540b3036e3'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('ceba190e-d4b4-4c67-8db2-26540b3036e3'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('bdfa85d1-0a1d-4269-a3ae-68345a6d4f4d'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('5cca22ac-2e74-498d-800e-34b0c7c03554'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('5cca22ac-2e74-498d-800e-34b0c7c03554'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('fade524c-3bbd-4e27-bea0-64bf031c07a0'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('3ac43372-61cf-4b14-a0e5-a55223b9eb19'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('3ac43372-61cf-4b14-a0e5-a55223b9eb19'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('7f1206ed-867e-4c68-95e9-d9df05a3069f'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('7f1206ed-867e-4c68-95e9-d9df05a3069f'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('7f1206ed-867e-4c68-95e9-d9df05a3069f'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('c5081dec-11aa-47a8-8fbb-45c702a0b174'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('c5081dec-11aa-47a8-8fbb-45c702a0b174'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('c5081dec-11aa-47a8-8fbb-45c702a0b174'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('864eab03-1c77-48c1-a09a-0da72d2c0114'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('864eab03-1c77-48c1-a09a-0da72d2c0114'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('dd874495-3274-402e-8e14-f6b6cfccebc2'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('fb18ec4b-e388-40c2-b7f3-ded5599db3d3'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('d58380fe-9620-4a96-af97-b776df20aa96'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('d58380fe-9620-4a96-af97-b776df20aa96'::uuid,'closed-won','Indication of Interest','2022-11-29T17:00:00Z'::timestamptz),
    ('d58380fe-9620-4a96-af97-b776df20aa96'::uuid,'ndaneeds-list-sent','Client Paused Deal','2023-02-01T17:00:00Z'::timestamptz),
    ('d059cbd5-8cd2-40ba-a2c4-1050d63fdbf9'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('1b20cfc9-1b9a-4abd-bb72-dc1385dd7cb6'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('1b20cfc9-1b9a-4abd-bb72-dc1385dd7cb6'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('1b20cfc9-1b9a-4abd-bb72-dc1385dd7cb6'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('c2320633-e7c8-4b18-a187-51e91ae788f1'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('2b7ce0c7-9b06-41c7-95c9-ddf1e3324bf6'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('36821d1a-0823-4108-9f9a-ac10804c769a'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('36821d1a-0823-4108-9f9a-ac10804c769a'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('91fedec9-1535-4b30-8263-1d09fba715e4'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('91fedec9-1535-4b30-8263-1d09fba715e4'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('26311cc7-c72f-43bd-a7cf-20ffe492124f'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('26311cc7-c72f-43bd-a7cf-20ffe492124f'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('a528565a-52b9-4880-b679-4fbf760283b0'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('a528565a-52b9-4880-b679-4fbf760283b0'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('3a8550be-63e5-4387-bd64-e1e2711f60f7'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('3a8550be-63e5-4387-bd64-e1e2711f60f7'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('8e9ad2d1-aff9-453e-b776-390fbc8091a1'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('8e9ad2d1-aff9-453e-b776-390fbc8091a1'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('53c9af3e-b4f8-4264-90dd-b19348cd7909'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('65704024-1876-4d5c-9e95-094ab6ee020d'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('65704024-1876-4d5c-9e95-094ab6ee020d'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('e8ce9b33-2a08-4306-894b-277f102d0f10'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('e8ce9b33-2a08-4306-894b-277f102d0f10'::uuid,'closed-won','Indication of Interest','2022-11-29T17:00:00Z'::timestamptz),
    ('e8ce9b33-2a08-4306-894b-277f102d0f10'::uuid,'ndaneeds-list-sent','Client Paused Deal','2023-02-01T17:00:00Z'::timestamptz),
    ('09a3a7d5-cc63-4db6-b428-dd1136f2ba68'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('09a3a7d5-cc63-4db6-b428-dd1136f2ba68'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('d41abd91-61e9-48e1-8b30-e6e3b024ee63'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('0740ba9a-3533-4301-8894-8bcd0aa92514'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('08e30fc2-a5fa-4ed2-ad61-688b1377c22c'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('08e30fc2-a5fa-4ed2-ad61-688b1377c22c'::uuid,'closed-won','Indication of Interest','2023-01-10T17:00:00Z'::timestamptz),
    ('08e30fc2-a5fa-4ed2-ad61-688b1377c22c'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('e24097c9-bdd4-4963-b917-24932522ec0a'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('e24097c9-bdd4-4963-b917-24932522ec0a'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('857b5020-68df-4c02-bd0a-122b1f74e655'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('400878ec-df15-4702-8ce0-b0b821c1be5f'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('400878ec-df15-4702-8ce0-b0b821c1be5f'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('bf78b8c1-fb81-4e32-91d6-389178bf876d'::uuid,NULL::text,'Submitted to Lenders','2022-11-30T17:00:00Z'::timestamptz),
    ('bf78b8c1-fb81-4e32-91d6-389178bf876d'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('bf78b8c1-fb81-4e32-91d6-389178bf876d'::uuid,'closed-won','Indication of Interest','2023-01-10T17:00:00Z'::timestamptz),
    ('1b5309f8-9a90-46dd-adb9-17811a389684'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('1b5309f8-9a90-46dd-adb9-17811a389684'::uuid,'closed-won','Indication of Interest','2023-01-20T17:00:00Z'::timestamptz),
    ('1b5309f8-9a90-46dd-adb9-17811a389684'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('473d75d1-c653-4519-9e26-0e817ce95218'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('473d75d1-c653-4519-9e26-0e817ce95218'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('a1468e98-99d1-4718-81b9-609109494190'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('d0d85635-c8bb-4b88-a7f7-cd307ec0fb9e'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('d0d85635-c8bb-4b88-a7f7-cd307ec0fb9e'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('e209609b-fd22-4f72-9620-258c9efa8bbc'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('a31457d5-ec3c-41c7-85b4-deda1e150420'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('26a17fca-42fc-436b-b610-763410a9de69'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('727eb465-a22c-443c-b0fc-6dbf4f4c353a'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('727eb465-a22c-443c-b0fc-6dbf4f4c353a'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('e3764360-2a31-4bd2-8c10-a5a1c3371585'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('e3764360-2a31-4bd2-8c10-a5a1c3371585'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('1c4ddee1-237a-47fe-88f3-e346946fd608'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('e9945847-865d-4b2d-ac37-25e95813c003'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('e9945847-865d-4b2d-ac37-25e95813c003'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('45e6c018-34b5-47cb-9040-dbc27b24eff4'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('87e7dac9-4f80-4196-8ca9-f303afa7843d'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('87e7dac9-4f80-4196-8ca9-f303afa7843d'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('0bc03819-79b2-448a-b006-4d271e5b6980'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('be0d420d-e4d2-4501-8410-26b53e81ae7b'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('bba9b082-d158-4002-b766-9520d9f2953c'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('a49a4907-1898-44c2-a968-f2ef8055700d'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('15747a4e-dc31-41cd-a58e-c5660aa2ad7d'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('15747a4e-dc31-41cd-a58e-c5660aa2ad7d'::uuid,'closed-won','Indication of Interest','2022-11-29T17:00:00Z'::timestamptz),
    ('15747a4e-dc31-41cd-a58e-c5660aa2ad7d'::uuid,'ndaneeds-list-sent','Client Paused Deal','2023-02-01T17:00:00Z'::timestamptz),
    ('1e1840d9-fa39-4d7a-9d03-1b7ab5aa8fc7'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('0d87515a-0073-4ddd-976f-0f64a649541b'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('0d87515a-0073-4ddd-976f-0f64a649541b'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('5e899250-f731-4394-b4c1-c2d2a7854b00'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('d4c58c3c-8aca-4404-8073-ca4ef556d7d3'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('2409d8a0-5644-49c2-9198-a64859aa050a'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz),
    ('2409d8a0-5644-49c2-9198-a64859aa050a'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('fd4ae2ff-a671-4915-b521-91e425e21d73'::uuid,NULL::text,'Submitted to Lenders','2022-11-15T17:00:00Z'::timestamptz),
    ('fd4ae2ff-a671-4915-b521-91e425e21d73'::uuid,'on-hold','Unresponsive','2025-10-22T16:00:00Z'::timestamptz),
    ('fd4ae2ff-a671-4915-b521-91e425e21d73'::uuid,'ndaneeds-list-sent','Client Paused Deal','2022-11-29T17:00:00Z'::timestamptz),
    ('81902913-c666-4848-9026-64a184ddf017'::uuid,'on-hold','Unresponsive','2022-11-29T17:00:00Z'::timestamptz),
    ('056cc79a-bff4-453a-a06a-6ba6016decf3'::uuid,'on-hold','Unresponsive','2025-08-21T16:00:00Z'::timestamptz)
  ) AS t(deal_id,stage_id,stage_label,changed_at) LOOP
    IF r.stage_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM deal_stage_history
          WHERE deal_id=r.deal_id AND pipeline_id=v_pipeline AND to_stage_id IS NULL
            AND to_stage=r.stage_label AND changed_at=r.changed_at AND source=v_src) THEN
        INSERT INTO deal_stage_history (deal_id, pipeline_id, to_stage_id, to_stage, event_type, changed_at, source)
        VALUES (r.deal_id, v_pipeline, NULL, r.stage_label, 'stage_enter', r.changed_at, v_src);
        v_inserts := v_inserts + 1;
      END IF;
    ELSE
      SELECT id INTO v_existing FROM deal_stage_history
        WHERE deal_id=r.deal_id AND pipeline_id=v_pipeline AND to_stage_id=r.stage_id
        ORDER BY changed_at ASC LIMIT 1;
      IF v_existing IS NULL THEN
        INSERT INTO deal_stage_history (deal_id, pipeline_id, to_stage_id, to_stage, event_type, changed_at, source)
        VALUES (r.deal_id, v_pipeline, r.stage_id, r.stage_label, 'stage_enter', r.changed_at, v_src);
        v_inserts := v_inserts + 1;
      ELSE
        UPDATE deal_stage_history SET changed_at=r.changed_at, source=v_src,
          to_stage=COALESCE(to_stage, r.stage_label)
          WHERE id=v_existing;
        v_updates := v_updates + 1;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'Batch3: % inserts, % updates (total %)', v_inserts, v_updates, v_inserts+v_updates;
  IF (v_inserts+v_updates) <> 143 THEN
    RAISE EXCEPTION 'Expected 143 ops, got %', v_inserts+v_updates;
  END IF;
END $$;
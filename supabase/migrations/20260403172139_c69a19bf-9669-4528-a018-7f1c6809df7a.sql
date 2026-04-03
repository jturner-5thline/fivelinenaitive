DELETE FROM cash_flow_imports WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf';
INSERT INTO cash_flow_imports (company_id, file_name, daily_data, row_structure, imported_by, updated_at)
VALUES (
  '44556c46-9127-4b12-b14e-d6fee784afcf',
  'COPY-Daily_CF.xlsx',
  '{"dates":["2025-01-01"]}'::jsonb,
  '{"rows":[]}'::jsonb,
  null,
  now()
)
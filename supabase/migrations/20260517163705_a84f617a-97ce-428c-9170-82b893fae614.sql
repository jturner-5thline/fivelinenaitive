
-- 1) Dedupe per-company partner_channel_types, keep oldest row per (company_id, name)
with ranked as (
  select id, company_id, name,
    row_number() over (partition by company_id, lower(name) order by created_at asc, id asc) as rn
  from public.partner_channel_types
)
delete from public.partner_channel_types pct
using ranked r
where pct.id = r.id and r.rn > 1;

-- 2) Add uniqueness so dupes cannot be re-inserted
create unique index if not exists ux_partner_channel_types_company_name
  on public.partner_channel_types (company_id, lower(name));

-- 3) Reset sort_order to canonical for known names; leave custom rows alone
update public.partner_channel_types set sort_order = 0 where name = 'Banks';
update public.partner_channel_types set sort_order = 1 where name = 'Service Providers';
update public.partner_channel_types set sort_order = 2 where name = 'Investors';
update public.partner_channel_types set sort_order = 3 where name = 'M&A';

-- 4) Ensure the global channel_types table is idempotently seeded (unique on name already exists)
insert into public.channel_types (name, description, sort_order) values
  ('Banks', 'Commercial / community banks referring out debt and finserv deals.', 1),
  ('Service Providers', 'Accountants, attorneys, consultants, advisors.', 2),
  ('Investors', 'VC, PE, family offices, angel networks.', 3),
  ('M&A', 'M&A advisors, business brokers, investment banks.', 4)
on conflict (name) do nothing;

-- 5) Audit entry
insert into public.sales_bd_audit (entity, field, old_value, new_value)
values (
  'channel_types',
  'cleanup',
  to_jsonb('duplicate partner_channel_types rows removed (kept oldest per company+name)'::text),
  to_jsonb('unique index added; client-side seeder removed'::text)
);

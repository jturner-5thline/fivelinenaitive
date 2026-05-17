
-- 1. Channel types
create table if not exists public.channel_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.channel_types (name, description, sort_order) values
  ('Banks', 'Commercial / community banks referring out debt and finserv deals.', 1),
  ('Service Providers', 'Accountants, attorneys, consultants, advisors.', 2),
  ('Investors', 'VC, PE, family offices, angel networks.', 3),
  ('M&A', 'M&A advisors, business brokers, investment banks.', 4)
on conflict (name) do nothing;

-- 2. companies.channel_type_id
alter table public.companies
  add column if not exists channel_type_id uuid references public.channel_types(id);
create index if not exists idx_companies_channel_type on public.companies(channel_type_id);

-- 3. referral_sources linkage (table already exists with different schema; extend safely)
alter table public.referral_sources
  add column if not exists contact_id uuid references public.contacts(id) on delete cascade;
create unique index if not exists ux_referral_sources_contact
  on public.referral_sources(contact_id) where contact_id is not null;

alter table public.deals
  add column if not exists referral_source_id uuid references public.referral_sources(id);
create index if not exists idx_deals_referral_source on public.deals(referral_source_id);

-- 4. sales_bd_rules
create table if not exists public.sales_bd_rules (
  id uuid primary key default gen_random_uuid(),
  tier1_qualified_deals int not null default 3,
  tier1_trailing_months int not null default 3,
  tier1_signed_clients int not null default 1,
  tier2_qualified_deals_min int not null default 2,
  tier2_qualified_deals_max int not null default 3,
  tier2_trailing_months int not null default 3,
  tier2_deals_on_board int not null default 4,
  tier3_deals_per_quarter int not null default 1,
  tier4_months_before_removal int not null default 6,
  active_referral_to_proposal int not null default 3,
  active_referral_trailing_months int not null default 3,
  active_signed_client int not null default 1,
  active_signed_trailing_months int not null default 3,
  active_referred_revenue numeric not null default 100000,
  active_revenue_trailing_months int not null default 12,
  public_partnership_required boolean not null default true,
  qualified_deal_stages text[] not null default array[
    'Proposal Issued','Agreement Pending','Final Credit Items',
    'Client Strategy Review','Write-Up Pending','Submitted to Lenders',
    'Lenders in Review','Terms Issued','In Due Diligence',
    'Funded / Invoiced','Closed Won'
  ],
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.sales_bd_rules (id)
select gen_random_uuid()
where not exists (select 1 from public.sales_bd_rules);

-- 5. Audit trail
create table if not exists public.sales_bd_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  entity text not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_bd_audit_created on public.sales_bd_audit(created_at desc);

-- 6. RLS
alter table public.channel_types enable row level security;
alter table public.sales_bd_rules enable row level security;
alter table public.sales_bd_audit enable row level security;

-- channel_types
drop policy if exists "channel_types_select_auth" on public.channel_types;
create policy "channel_types_select_auth" on public.channel_types
  for select to authenticated using (true);

drop policy if exists "channel_types_admin_write" on public.channel_types;
create policy "channel_types_admin_write" on public.channel_types
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- sales_bd_rules
drop policy if exists "sales_bd_rules_select_auth" on public.sales_bd_rules;
create policy "sales_bd_rules_select_auth" on public.sales_bd_rules
  for select to authenticated using (true);

drop policy if exists "sales_bd_rules_admin_write" on public.sales_bd_rules;
create policy "sales_bd_rules_admin_write" on public.sales_bd_rules
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- sales_bd_audit: admin read only; inserts via trigger (security definer)
drop policy if exists "sales_bd_audit_admin_select" on public.sales_bd_audit;
create policy "sales_bd_audit_admin_select" on public.sales_bd_audit
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_channel_types_updated_at on public.channel_types;
create trigger trg_channel_types_updated_at
  before update on public.channel_types
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_bd_rules_updated_at on public.sales_bd_rules;
create trigger trg_sales_bd_rules_updated_at
  before update on public.sales_bd_rules
  for each row execute function public.set_updated_at();

-- Audit trigger for sales_bd_rules
create or replace function public.audit_sales_bd_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  old_json jsonb := to_jsonb(old);
  new_json jsonb := to_jsonb(new);
  actor uuid := auth.uid();
begin
  for r in select key from jsonb_each(new_json) loop
    if r.key in ('updated_at','updated_by','id') then
      continue;
    end if;
    if old_json->r.key is distinct from new_json->r.key then
      insert into public.sales_bd_audit (actor_id, entity, field, old_value, new_value)
      values (actor, 'sales_bd_rules', r.key, old_json->r.key, new_json->r.key);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_audit_sales_bd_rules on public.sales_bd_rules;
create trigger trg_audit_sales_bd_rules
  after update on public.sales_bd_rules
  for each row execute function public.audit_sales_bd_rules();

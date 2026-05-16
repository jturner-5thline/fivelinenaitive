
create table if not exists public.dashboard_kpi_plans (
  metric_key text primary key,
  label text not null,
  plan_value numeric not null default 0,
  format_type text not null default 'number',
  comparison_mode text not null default 'plan',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.dashboard_kpi_plans enable row level security;

drop policy if exists "kpi_plans_select_authed" on public.dashboard_kpi_plans;
create policy "kpi_plans_select_authed"
  on public.dashboard_kpi_plans for select
  to authenticated using (true);

drop policy if exists "kpi_plans_insert_admin" on public.dashboard_kpi_plans;
create policy "kpi_plans_insert_admin"
  on public.dashboard_kpi_plans for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email','')) in (
    'jturner@5thline.co','jmoffitt@5thline.co','jrivera@5thline.co',
    'cminaldi@5thline.co','mclark@5thline.co','swilliams@5thline.co',
    'mkaleniecki@5thline.co'
  ));

drop policy if exists "kpi_plans_update_admin" on public.dashboard_kpi_plans;
create policy "kpi_plans_update_admin"
  on public.dashboard_kpi_plans for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email','')) in (
    'jturner@5thline.co','jmoffitt@5thline.co','jrivera@5thline.co',
    'cminaldi@5thline.co','mclark@5thline.co','swilliams@5thline.co',
    'mkaleniecki@5thline.co'
  ))
  with check (lower(coalesce(auth.jwt() ->> 'email','')) in (
    'jturner@5thline.co','jmoffitt@5thline.co','jrivera@5thline.co',
    'cminaldi@5thline.co','mclark@5thline.co','swilliams@5thline.co',
    'mkaleniecki@5thline.co'
  ));

insert into public.dashboard_kpi_plans (metric_key, label, plan_value, format_type) values
  ('deals_closed', 'Deals Closed', 16, 'number'),
  ('dollars_funded', 'Dollars Funded', 117750000, 'currency'),
  ('new_clients', 'New Clients', 12, 'number'),
  ('fee_revenue', 'Fee Revenue', 2000000, 'currency')
on conflict (metric_key) do nothing;

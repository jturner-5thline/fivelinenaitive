create table if not exists public.naitive_deal_stage_meta (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  hold_tag text,
  hold_reason text,
  revisit_date date,
  closed_lost_reason text,
  dormant_started_at timestamptz,
  transition_notes text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists idx_naitive_deal_stage_meta_revisit
  on public.naitive_deal_stage_meta (revisit_date)
  where revisit_date is not null;

alter table public.naitive_deal_stage_meta enable row level security;

drop policy if exists "naitive_deal_stage_meta_select" on public.naitive_deal_stage_meta;
create policy "naitive_deal_stage_meta_select" on public.naitive_deal_stage_meta
  for select to authenticated using (true);

drop policy if exists "naitive_deal_stage_meta_insert" on public.naitive_deal_stage_meta;
create policy "naitive_deal_stage_meta_insert" on public.naitive_deal_stage_meta
  for insert to authenticated with check (true);

drop policy if exists "naitive_deal_stage_meta_update" on public.naitive_deal_stage_meta;
create policy "naitive_deal_stage_meta_update" on public.naitive_deal_stage_meta
  for update to authenticated using (true) with check (true);

drop policy if exists "naitive_deal_stage_meta_delete" on public.naitive_deal_stage_meta;
create policy "naitive_deal_stage_meta_delete" on public.naitive_deal_stage_meta
  for delete to authenticated using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'support_admin'::app_role)
  );

create or replace function public.tg_naitive_deal_stage_meta_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_naitive_deal_stage_meta_touch on public.naitive_deal_stage_meta;
create trigger trg_naitive_deal_stage_meta_touch
  before update on public.naitive_deal_stage_meta
  for each row execute function public.tg_naitive_deal_stage_meta_touch();

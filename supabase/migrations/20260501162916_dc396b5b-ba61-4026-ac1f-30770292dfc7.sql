-- =========================================================
-- email_cadence_profiles : per-user, per-contact cadence stats
-- =========================================================
create table if not exists public.email_cadence_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_email text not null,
  contact_name text,
  -- volume
  outbound_count integer not null default 0,
  inbound_count integer not null default 0,
  -- cadence
  avg_followup_interval_days numeric(8,2),
  median_followup_interval_days numeric(8,2),
  avg_response_time_hours numeric(8,2),
  -- recency
  first_contact_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  last_contact_at timestamptz,
  -- tone hints (JSON: {formality:'formal'|'casual', avg_length_words:int, common_greeting, common_closing, signature_off})
  tone jsonb not null default '{}'::jsonb,
  -- relationship hint inferred from email volume / domain (founder, lender, internal, vendor, other)
  relationship_type text,
  sample_size integer not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_email)
);

create index if not exists idx_email_cadence_user on public.email_cadence_profiles(user_id);
create index if not exists idx_email_cadence_user_last on public.email_cadence_profiles(user_id, last_contact_at desc);
create index if not exists idx_email_cadence_user_email on public.email_cadence_profiles(user_id, lower(contact_email));

alter table public.email_cadence_profiles enable row level security;

create policy "Owner reads own cadence profiles"
  on public.email_cadence_profiles for select
  to authenticated using (user_id = auth.uid());

create policy "Owner inserts own cadence profiles"
  on public.email_cadence_profiles for insert
  to authenticated with check (user_id = auth.uid());

create policy "Owner updates own cadence profiles"
  on public.email_cadence_profiles for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Owner deletes own cadence profiles"
  on public.email_cadence_profiles for delete
  to authenticated using (user_id = auth.uid());

-- =========================================================
-- email_cadence_jobs : on-demand scan run history
-- =========================================================
create table if not exists public.email_cadence_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending', -- pending | running | done | error
  scope text not null default 'cache',    -- cache | extended (future: pull more from Nylas)
  contacts_processed integer not null default 0,
  messages_scanned integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_cadence_jobs_user on public.email_cadence_jobs(user_id, created_at desc);

alter table public.email_cadence_jobs enable row level security;

create policy "Owner reads own cadence jobs"
  on public.email_cadence_jobs for select
  to authenticated using (user_id = auth.uid());

create policy "Owner inserts own cadence jobs"
  on public.email_cadence_jobs for insert
  to authenticated with check (user_id = auth.uid());

create policy "Owner updates own cadence jobs"
  on public.email_cadence_jobs for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- updated_at triggers (reuse existing helper)
create trigger trg_email_cadence_profiles_updated_at
  before update on public.email_cadence_profiles
  for each row execute function public.update_updated_at_column();

create trigger trg_email_cadence_jobs_updated_at
  before update on public.email_cadence_jobs
  for each row execute function public.update_updated_at_column();
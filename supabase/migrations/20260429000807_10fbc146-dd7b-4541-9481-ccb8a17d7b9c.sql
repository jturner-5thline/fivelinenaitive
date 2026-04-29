-- Email drafts: per-user, per-thread auto-saved composer state.
-- Each user can have at most one active draft per thread. Sending or
-- discarding the draft removes the row. Sender metadata (auto-link to deal,
-- track opens) is persisted alongside the draft body so the user picks back
-- up exactly where they left off.

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text not null,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text,
  body text,
  attachments text[] not null default '{}',
  to_name text,
  -- Composer toggles persisted with the draft so they survive reloads.
  auto_link_deal boolean not null default true,
  track_opens boolean not null default false,
  deal_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, thread_id)
);

create index if not exists email_drafts_user_thread_idx
  on public.email_drafts (user_id, thread_id);

alter table public.email_drafts enable row level security;

-- Self-only access. Owners can read/write/delete their own drafts.
drop policy if exists "Users view their own email drafts" on public.email_drafts;
create policy "Users view their own email drafts"
on public.email_drafts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert their own email drafts" on public.email_drafts;
create policy "Users insert their own email drafts"
on public.email_drafts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update their own email drafts" on public.email_drafts;
create policy "Users update their own email drafts"
on public.email_drafts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete their own email drafts" on public.email_drafts;
create policy "Users delete their own email drafts"
on public.email_drafts
for delete
to authenticated
using (auth.uid() = user_id);

-- Auto-bump updated_at on any row update.
drop trigger if exists trg_email_drafts_set_updated_at on public.email_drafts;
create trigger trg_email_drafts_set_updated_at
before update on public.email_drafts
for each row
execute function public.update_updated_at_column();
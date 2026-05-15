create table if not exists public.ai_action_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  conversation_id uuid,
  action_type text not null,
  intent text,
  prompt text,
  resolved_deal_id uuid,
  resolved_deal_name text,
  resolved_assignee_user_id uuid,
  resolved_assignee_name text,
  extracted_fields jsonb default '{}'::jsonb,
  confidence jsonb default '{}'::jsonb,
  clarification_required boolean default false,
  clarification_reason text,
  outcome text not null default 'drafted',
  outcome_detail text,
  created_task_id uuid,
  error_message text,
  page_context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_action_audit_user_created on public.ai_action_audit (user_id, created_at desc);
create index if not exists idx_ai_action_audit_company_created on public.ai_action_audit (company_id, created_at desc);
create index if not exists idx_ai_action_audit_outcome on public.ai_action_audit (outcome);
create index if not exists idx_ai_action_audit_deal on public.ai_action_audit (resolved_deal_id);

alter table public.ai_action_audit enable row level security;

create policy "Users read their own AI audit rows"
  on public.ai_action_audit
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "5th Line admins read all AI audit rows"
  on public.ai_action_audit
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and lower(coalesce(p.email, '')) in (
          'james@5thline.com', 'jturner@5thline.com', 'niki@5thline.com',
          'paz@5thline.com', 'scott@5thline.com'
        )
    )
  );

create trigger trg_ai_action_audit_updated_at
  before update on public.ai_action_audit
  for each row execute function public.update_updated_at_column();
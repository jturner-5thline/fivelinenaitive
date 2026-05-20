DO $$
DECLARE
  cid uuid := gen_random_uuid();
  greg_id uuid := gen_random_uuid();
  polly_id uuid := gen_random_uuid();
BEGIN
  ALTER TABLE public.company_members DISABLE TRIGGER trg_seed_new_company_on_member;

  INSERT INTO public.companies (id, name, primary_domain, domains, account_type, subscription_status)
  VALUES (cid, 'Blount Capital', 'blount.capital', ARRAY['blount.capital'], 'customer', 'active');

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  VALUES
  ('00000000-0000-0000-0000-000000000000', greg_id, 'authenticated', 'authenticated',
   'greg@blount.capital', crypt('blountcapital26', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('first_name','Greg','last_name','Blount','full_name','Greg Blount'),
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', polly_id, 'authenticated', 'authenticated',
   'polly@blount.capital', crypt('blountcapital26', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('first_name','Polly','last_name','Traylor','full_name','Polly Traylor'),
   now(), now(), '', '', '', '');

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES
  (gen_random_uuid(), greg_id,
    jsonb_build_object('sub', greg_id::text, 'email', 'greg@blount.capital', 'email_verified', true),
    'email', greg_id::text, now(), now(), now()),
  (gen_random_uuid(), polly_id,
    jsonb_build_object('sub', polly_id::text, 'email', 'polly@blount.capital', 'email_verified', true),
    'email', polly_id::text, now(), now(), now());

  DELETE FROM public.profiles WHERE user_id IN (greg_id, polly_id);
  INSERT INTO public.profiles (
    user_id, display_name, first_name, last_name, email,
    onboarding_completed, approved_at, approved_by,
    email_notifications, deal_updates_email, lender_updates_email, weekly_summary_email,
    in_app_notifications, deal_updates_app, lender_updates_app,
    notify_stale_alerts, notify_activity_deal_created, notify_activity_lender_added,
    notify_activity_lender_updated, notify_activity_stage_changed, notify_activity_status_changed,
    notify_activity_milestone_added, notify_activity_milestone_completed, notify_activity_milestone_missed,
    notify_flex_alerts, notify_info_request_emails
  ) VALUES
  (greg_id, 'Greg Blount', 'Greg', 'Blount', 'greg@blount.capital',
   true, now(), greg_id,
   false,false,false,false, true,true,true,
   false,false,false,false,false,false,false,false,false,false,false),
  (polly_id, 'Polly Traylor', 'Polly', 'Traylor', 'polly@blount.capital',
   true, now(), greg_id,
   false,false,false,false, true,true,true,
   false,false,false,false,false,false,false,false,false,false,false);

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (cid, greg_id, 'admin'), (cid, polly_id, 'admin');

  ALTER TABLE public.company_members ENABLE TRIGGER trg_seed_new_company_on_member;

  RAISE NOTICE 'Created Blount Capital company_id=% greg=% polly=%', cid, greg_id, polly_id;
END $$;

DO $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_pipeline_id uuid := gen_random_uuid();
  v_email text := 'cday@griffinmoor.com';
  v_password text := 'griffinmoor123';
  v_stages jsonb;
  v_crm_ids uuid[] := ARRAY[]::uuid[];
  v_new_uuid uuid;
  v_i int;
  v_crm_names text[] := ARRAY[
    'Alpine Robotics','Beacon Health Group','Coastal Forge Industries','Drayton Logistics',
    'Evergreen Foods Co','Falcon Optics','Granite Peak Capital','Harbor Lane Brewing',
    'Ironwood Analytics','Juniper Mobility','Kestrel Aerospace','Lumen Bio Labs'
  ];
  v_first text[] := ARRAY['Avery','Blake','Casey','Drew','Elliot','Finley','Gray','Harper','Indigo','Jordan','Kai','Logan','Morgan','Nico','Onyx','Parker','Quinn','Riley','Sage','Tatum','Umi','Vale','Wren','Xan','Yael'];
  v_last text[] := ARRAY['Hartwell','Bishop','Calderon','Devine','Ellison','Fairchild','Granger','Holloway','Ivers','Jansen','Kavanaugh','Lockwood','Marsh','Nilsson','Ortega','Pendleton','Quigley','Ramsay','Sutherland','Thorne','Underhill','Vance','Whitlock','Xavier','Yarrow'];
  v_lender_names text[] := ARRAY[
    'Northwind Credit Partners','Silverline Capital','Meridian Debt Fund','Cobalt Mezzanine',
    'Pinecrest Senior Lending','Ridgeway Specialty Finance','Sapphire Growth Credit','Tidewater Private Credit',
    'Voyage Direct Lending','Westmark Strategic Capital','Argyle Bridge Finance','Brookhaven Credit',
    'Crestwood Asset-Based','Dunmore Venture Debt','Eastwind Structured Capital'
  ];
  v_lender_types text[] := ARRAY['Direct Lender','Bank','Mezzanine','BDC','SBIC','Family Office','Specialty Finance'];
  v_deal_stages text[] := ARRAY[
    'ndaneeds-list-sent','pre-credit-needs','initial-lender-review','proposal-issued',
    'agreement-pending','write-up-pending','submitted-to-lenders','lenders-in-review',
    'terms-issued','closed-won'
  ];
  v_deal_companies text[] := ARRAY[
    'Alpine Robotics','Beacon Health Group','Coastal Forge Industries','Drayton Logistics',
    'Evergreen Foods Co','Falcon Optics','Granite Peak Capital','Harbor Lane Brewing',
    'Ironwood Analytics','Juniper Mobility'
  ];
  v_deal_values numeric[] := ARRAY[12500000,8500000,22000000,5400000,17800000,9650000,31000000,4250000,14750000,28500000];
BEGIN
  -- 1. Auth user
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated', v_email,
      crypt(v_password, gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('display_name','Clarence Day','full_name','Clarence Day'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
    VALUES (v_user_id, 'email', v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           raw_user_meta_data = jsonb_build_object('display_name','Clarence Day','full_name','Clarence Day'),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- 2. Company
  SELECT id INTO v_company_id FROM public.companies WHERE name = 'Griffin Moor';
  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, account_type)
    VALUES ('Griffin Moor','demo')
    RETURNING id INTO v_company_id;
  END IF;

  -- 3. Profile + membership + role
  INSERT INTO public.profiles (user_id, display_name) VALUES (v_user_id, 'Clarence Day')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (v_company_id, v_user_id, 'owner')
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner';
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- 4. Wipe prior tenant-scoped data
  DELETE FROM public.deals          WHERE company_id = v_company_id;
  DELETE FROM public.contacts       WHERE company_id = v_company_id;
  DELETE FROM public.crm_companies  WHERE owner_user_id = v_user_id;
  DELETE FROM public.master_lenders WHERE company_id = v_company_id;
  DELETE FROM public.deal_pipelines WHERE company_id = v_company_id;

  -- 5. Default pipeline
  v_stages := '[
    {"id":"on-hold","label":"Deal/Diligence Paused/On Hold","color":"bg-muted"},
    {"id":"ndaneeds-list-sent","label":"NDA/Needs List Sent","color":"bg-blue-500/15"},
    {"id":"pre-credit-needs","label":"Pre-Credit Needs","color":"bg-indigo-500/15"},
    {"id":"initial-lender-review","label":"Initial Lender Review","color":"bg-violet-500/15"},
    {"id":"initial-feedback","label":"Initial Feedback","color":"bg-purple-500/15"},
    {"id":"proposal-in-development","label":"Proposal In Development","color":"bg-fuchsia-500/15"},
    {"id":"proposal-issued","label":"Proposal Issued","color":"bg-pink-500/15"},
    {"id":"agreement-pending","label":"Agreement Pending","color":"bg-rose-500/15"},
    {"id":"final-credit-items","label":"Final Credit Items","color":"bg-amber-500/15"},
    {"id":"client-strategy-review","label":"Client Strategy Review","color":"bg-yellow-500/15"},
    {"id":"write-up-pending","label":"Write-Up Pending","color":"bg-lime-500/15"},
    {"id":"submitted-to-lenders","label":"Submitted to Lenders","color":"bg-green-500/15"},
    {"id":"lenders-in-review","label":"Lenders in Review","color":"bg-emerald-500/15"},
    {"id":"terms-issued","label":"Terms Issued","color":"bg-teal-500/15"},
    {"id":"in-due-diligence","label":"In Due Diligence","color":"bg-cyan-500/15"},
    {"id":"funded-invoiced","label":"Funded / Invoiced","color":"bg-sky-500/15"},
    {"id":"closed-won","label":"Closed Won","color":"bg-emerald-600/20"},
    {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500/15"}
  ]'::jsonb;
  INSERT INTO public.deal_pipelines (id, company_id, name, stages, is_default, position)
  VALUES (v_pipeline_id, v_company_id, 'Active Deals', v_stages, true, 0);

  -- 6. CRM companies (12)
  FOR v_i IN 1..array_length(v_crm_names,1) LOOP
    v_new_uuid := gen_random_uuid();
    INSERT INTO public.crm_companies (id, name, domain, owner_user_id, industry, employee_count, annual_revenue, hq_city, hq_state, hq_country, lifecycle_stage)
    VALUES (
      v_new_uuid, v_crm_names[v_i],
      lower(replace(v_crm_names[v_i],' ','')) || '.example.com', v_user_id,
      (ARRAY['Technology','Healthcare','Manufacturing','Logistics','Food & Beverage','Optics','Financial Services','Beverage','Software','Mobility','Aerospace','Biotech'])[v_i],
      (ARRAY[120,340,520,210,780,95,260,60,180,140,420,310])[v_i],
      (ARRAY[18000000,42000000,68000000,24000000,95000000,12000000,38000000,8000000,22000000,16000000,54000000,40000000])[v_i]::numeric,
      (ARRAY['Denver','Boston','Pittsburgh','Atlanta','Portland','San Diego','Chicago','Asheville','Austin','Detroit','Seattle','Cambridge'])[v_i],
      (ARRAY['CO','MA','PA','GA','OR','CA','IL','NC','TX','MI','WA','MA'])[v_i],
      'USA','qualified'
    );
    v_crm_ids := v_crm_ids || v_new_uuid;
  END LOOP;

  -- 7. Contacts (25) — omit primary_company_id (FK is to companies table, not CRM)
  FOR v_i IN 1..25 LOOP
    INSERT INTO public.contacts (
      company_id, first_name, last_name, email,
      phone_mobile, job_title, owner_user_id, lifecycle_stage, status
    ) VALUES (
      v_company_id, v_first[v_i], v_last[v_i],
      lower(v_first[v_i]) || '.' || lower(v_last[v_i]) || '@' ||
        regexp_replace(lower(v_crm_names[1 + ((v_i - 1) % array_length(v_crm_names,1))]),' ','','g') || '.example.com',
      '+1-555-01' || lpad(v_i::text,2,'0'),
      (ARRAY['CEO','CFO','COO','VP Finance','Controller','Head of Strategy','Director of Finance','Treasurer','VP Operations','General Counsel'])[1 + (v_i % 10)],
      v_user_id, 'qualifiedlead','new'
    );
  END LOOP;

  -- 8. Master lenders (15)
  FOR v_i IN 1..array_length(v_lender_names,1) LOOP
    INSERT INTO public.master_lenders (
      user_id, company_id, name, email, lender_type, loan_types,
      min_deal, max_deal, min_revenue, ebitda_min,
      industries, geo, contact_name, contact_title
    ) VALUES (
      v_user_id, v_company_id, v_lender_names[v_i],
      'contact-' || v_i || '@' || regexp_replace(lower(v_lender_names[v_i]),' ','','g') || '.example.com',
      v_lender_types[1 + ((v_i - 1) % array_length(v_lender_types,1))],
      ARRAY['Senior Debt','Unitranche','Mezzanine']::text[],
      (ARRAY[2000000,5000000,10000000,3000000,7500000,1500000,8000000,2500000,4000000,6000000,3500000,5500000,4500000,9000000,12000000])[v_i]::numeric,
      (ARRAY[25000000,50000000,150000000,40000000,100000000,30000000,200000000,35000000,60000000,80000000,45000000,75000000,55000000,120000000,180000000])[v_i]::numeric,
      (ARRAY[10000000,20000000,40000000,15000000,30000000,8000000,50000000,12000000,25000000,35000000,18000000,28000000,22000000,45000000,60000000])[v_i]::numeric,
      (ARRAY[2000000,4000000,8000000,3000000,6000000,1500000,10000000,2500000,5000000,7000000,3500000,5500000,4500000,9000000,12000000])[v_i]::numeric,
      ARRAY['Technology','Healthcare','Manufacturing','Services']::text[],
      'North America', 'Demo Contact ' || v_i,
      (ARRAY['Managing Director','Partner','Principal','VP','Director','Senior Associate'])[1 + (v_i % 6)]
    );
  END LOOP;

  -- 9. Deals (10 at various stages)
  FOR v_i IN 1..10 LOOP
    INSERT INTO public.deals (
      user_id, company_id, pipeline_id,
      company, value, stage, status, deal_type, engagement_type,
      manager, deal_owner, crm_company_id, deal_class,
      narrative, business_model
    ) VALUES (
      v_user_id, v_company_id, v_pipeline_id,
      v_deal_companies[v_i], v_deal_values[v_i], v_deal_stages[v_i], 'active',
      (ARRAY['Senior Debt','Unitranche','Refinance','Growth Capital','Acquisition Finance','Mezzanine','ABL','Recapitalization','Bridge','Senior Debt'])[v_i],
      'Debt Advisory','Clarence Day','Clarence Day',
      v_crm_ids[v_i],'standard',
      'Demo deal narrative for ' || v_deal_companies[v_i] || '. Sample data only — not a real opportunity.',
      'B2B'
    );
  END LOOP;

  RAISE NOTICE 'Provisioned Griffin Moor: user_id=% company_id=%', v_user_id, v_company_id;
END $$;

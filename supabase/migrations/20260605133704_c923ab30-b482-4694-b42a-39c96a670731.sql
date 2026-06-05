
DO $mig$
DECLARE
  v_tenant uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  v_companies_created int := 0;
  v_contacts_inserted int := 0;
  v_contacts_skipped int := 0;
  r record;
  v_company_id uuid;
  v_first text;
  v_last text;
BEGIN
  CREATE TEMP TABLE _bc_src(company_name text, contact_name text) ON COMMIT DROP;
  INSERT INTO _bc_src(company_name, contact_name) VALUES
    ('Wells Fargo','Lisa Murgia'),
    ('Club Five Health - PT / Chiro Warehouse Buildout','John Hanna'),
    ('TriNeo Energy','Kirk Pearcy'),
    ('BoxPort Capital','Adam Mayer'),
    ('TicketVision','Dillon Barendt'),
    ('TBD','Brandon Seifert'),
    ('PiperWai','Sarah Ribner'),
    ('Candela Liquors','Alejandro Russo'),
    ('ThinkClean','Rodney Jones'),
    ('Native Traits','Michael Bennett'),
    ('WH Keiser & Co','Will Keiser'),
    ('NXTMoves','Steve Pontius'),
    ('Compound Foundry','Terry Turpin'),
    ('Honor Pet','Eli Harris'),
    ('Eflion','Yaser Ali'),
    ('Bailey & Co','Peter Machmeier'),
    ('Urban Electric Power','Gabe Cowles'),
    ('HealthFleet','Demos Kouvaris'),
    ('FFO','Tom Daly'),
    ('California Cultured','Alan Perlstein'),
    ('BlueNalu','Edward Badal'),
    ('OpenDroids','Varun Sharat'),
    ('TBD','George Jorgoni'),
    ('Phoenix Footwear','Jim Riedman'),
    ('Voda Restoration','Dan Claps'),
    ('FarrPro','Luke Haverhals'),
    ('Alta Water','Jono Ebert'),
    ('Blount Capital Consulting','Polly TEST'),
    ('RxEbate','Jefferson Tingey'),
    ('Independent Sponsor - Healthcare Fund Raise','Ruben Cotti-Lowell'),
    ('The Steam Bar','Judy Koloko'),
    ('Surevix','Vladimir Bruno'),
    ('Acquisition Network','Ryan Morgan'),
    ('Aurelux Group','Leroy Glass'),
    ('Insignary','Taek Wan Kim'),
    ('UrbanChain Group','Vitaly Pentegrov'),
    ('Texco Materials','Mohamed Sameh Shahwan'),
    ('Club Condor','Albert Lindsell'),
    ('Blount Capital Consulting','Greg Blount'),
    ('Surevix - Project Sea Acquisition','Tina Khadivi'),
    ('Oak Proof LLC','Todd Camhe'),
    ('Water Garden Farms','Bertrand Deleuse'),
    ('Mazuma Capital','Jace DeGrange'),
    ('Priority Capital','Greg Doutre'),
    ('UCEA Family Office Event Financing','navtej shanker'),
    ('Health Endeavors','Jeff Peterson'),
    ('Health Endeavors','David Derrick'),
    ('Decathlon Capital','Kevin Grossman'),
    ('Mizzen Capital','Victoria Shih'),
    ('Optivide','Danny Chen'),
    ('Capitala','Bridget Meller'),
    ('Frontier Capital','Yarin Shahbar'),
    ('Pelham S2K','Scott Sobel'),
    ('Hatch Advisors','Nick Hatch'),
    ('Morfeu AI','sali igbal ferad'),
    ('Argosy Credit Partners','Michael Shen'),
    ('Argosy Credit Partners','Linnea Begley'),
    ('Commercial Finance Partners','darren palestine'),
    ('Granite Creek','Matt Morgan'),
    ('Aurum Impact','Miki Yokoyama'),
    ('sigular guff','Michael Stovall'),
    ('Plexus Capital','Cameron Coley'),
    ('Prospect Capital Management','Jake Landau'),
    ('Gemini Investors','Chris Hughes'),
    ('Enhanced Capital','Mary Sue Emerson'),
    ('EVRNU','Stacy Flynn'),
    ('IBC Funds','Tyler Bozynski'),
    ('TRUE linkswear','Greg Wittreich'),
    ('The Firmament Group','Lisa Moraglia'),
    ('Durham Capital Corporation','Sylvester Miniter'),
    ('Black Feather Funding','David Ellis'),
    ('Rock Shelter Capital','Steve Landzberg'),
    ('Centauri Health Solutions','Adam Miller'),
    ('TRUE linkswear','Jason Moore'),
    ('Level 7 Investments','Yann Com-Nougué'),
    ('Freedom Trail Capital','Samyr Laine'),
    ('Utah Cannabis','john hanna'),
    ('Clearline Financial','Justin Rivera'),
    ('Fortress','Christopher Lipuma'),
    ('Grange Park Partners','Jeremy Jacobowitz'),
    ('Black Feather Funding','Annie OConnor'),
    ('Black Feather Funding','Ashley West'),
    ('Goliath Cyber Security Group','Mark Bronzo'),
    ('RYE Strategic Group','Eddie Bugniazet'),
    ('Goliath Cyber Security Group','Dave Ackley'),
    ('Brown Rock Holdings','Darius Henry');

  FOR r IN SELECT DISTINCT btrim(company_name) AS cname FROM _bc_src LOOP
    SELECT id INTO v_company_id
      FROM public.crm_companies
     WHERE org_company_id = v_tenant
       AND btrim(name) ILIKE r.cname
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1;
    IF v_company_id IS NULL THEN
      INSERT INTO public.crm_companies(id, name, org_company_id, created_at, updated_at)
      VALUES (gen_random_uuid(), r.cname, v_tenant, now(), now())
      RETURNING id INTO v_company_id;
      v_companies_created := v_companies_created + 1;
    END IF;
  END LOOP;

  FOR r IN SELECT btrim(company_name) AS cname, btrim(contact_name) AS pname FROM _bc_src LOOP
    SELECT id INTO v_company_id
      FROM public.crm_companies
     WHERE org_company_id = v_tenant
       AND btrim(name) ILIKE r.cname
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1;

    IF EXISTS (
      SELECT 1 FROM public.contacts
       WHERE org_company_id = v_tenant
         AND crm_company_id = v_company_id
         AND btrim(full_name) ILIKE r.pname
    ) THEN
      v_contacts_skipped := v_contacts_skipped + 1;
      CONTINUE;
    END IF;

    IF position(' ' in r.pname) > 0 THEN
      v_first := split_part(r.pname, ' ', 1);
      v_last  := btrim(substring(r.pname from position(' ' in r.pname) + 1));
    ELSE
      v_first := r.pname;
      v_last  := NULL;
    END IF;

    INSERT INTO public.contacts(
      id, org_company_id, crm_company_id,
      first_name, last_name,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_tenant, v_company_id,
      v_first, v_last,
      now(), now()
    );
    v_contacts_inserted := v_contacts_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Blount Capital tenant: %', v_tenant;
  RAISE NOTICE 'CRM companies newly created: %', v_companies_created;
  RAISE NOTICE 'Contacts inserted: %', v_contacts_inserted;
  RAISE NOTICE 'Contacts skipped (already present): %', v_contacts_skipped;
END
$mig$;

-- Stage list of (name, job_title, linkedin_url) for Blount Capital
CREATE TEMP TABLE _blount_jobs (full_name text, job_title text, linkedin_url text) ON COMMIT DROP;

INSERT INTO _blount_jobs VALUES
  ('Jim Opdyke', 'Executive Vice President, LA Coastal Commercial Banking Market Executive', 'https://www.linkedin.com/in/jim-opdyke-2409934'),
  ('Lisa Murgia', 'Managing Director, Commercial Banking Leader', 'https://www.linkedin.com/in/lisamurgia/'),
  ('Armello Rodriguez', 'Vice President, Technology Banking', 'https://www.linkedin.com/in/armello-rodriguez-0a31b377/'),
  ('Melissa Fulmer', 'Vice President / Regional Sales Leader, Commercial Banking', 'https://www.linkedin.com/in/melissafulmer/'),
  ('Art Avitia', 'Senior Vice President, Senior Relationship Manager, Global Commercial Banking', 'https://www.linkedin.com/in/artavitia/'),
  ('Charlie Chadderdon', 'Senior Vice President, Managing Director', 'https://www.linkedin.com/in/charliechadderdon'),
  ('Perry Moreth', 'Global Advisor, Specialized Industries Group', 'https://www.linkedin.com/in/perry-moreth-5698149/'),
  ('Tyler Dobson', 'Executive Director, Technology Banking', 'https://www.linkedin.com/in/tyler-dobson-4217a06/'),
  ('Mario Canedo II', 'Vice President, Middle Market Commercial Banker', 'https://www.linkedin.com/in/mario-ca%C3%B1edo-ii-540b0315b/'),
  ('James Do', 'President, Community First Financial Resources', NULL),
  ('Britt Nelson', NULL, 'https://www.linkedin.com/in/brittnelson/'),
  ('Benjamin Vanderford', 'Managing Director', 'https://www.linkedin.com/in/benjaminvanderford/'),
  ('Fred Vela', 'Executive Director, San Francisco North Bay Middle Market Banking', 'https://www.linkedin.com/in/fred-vela-367a72/'),
  ('Michael Stahl', NULL, 'https://www.linkedin.com/in/mike-stahl-3604b54/'),
  ('John Huber', 'National Advisory Lead, Technology Banking Group', 'https://www.linkedin.com/in/johuber/'),
  ('Bradley Biddulph', 'Director', 'https://www.linkedin.com/in/bradley-biddulph-bba587114'),
  ('Shayna Modarresi', 'Senior Vice President, Venture Debt Investor', 'https://www.linkedin.com/in/shayna7'),
  ('Mike Earnhart', 'SVP, Western Regional Sales Manager', 'https://www.linkedin.com/in/mike-earnhart-a5026a182/'),
  ('Matt Servatius', 'Market Executive, Central Region Technology Banking & Sustainable Technology', 'https://www.linkedin.com/in/matthew-servatius-aa41aa12'),
  ('Stevie Jesme', 'Director, Venture Banking', 'https://www.linkedin.com/in/stevie-jesme/'),
  ('Clifford Son', 'Vice President, Commercial Banker', 'https://www.linkedin.com/in/clifford-son/'),
  ('Ian McElfresh', 'Assistant Vice President, Venture Lending', 'https://www.linkedin.com/in/ian-mcelfresh-736804177'),
  ('Michael L David', 'Venture Capital & Private Equity Industry Partner', 'https://www.linkedin.com/in/michaeldavidsv/'),
  ('Stephen Kantor', 'Northern California Division Sales Executive', 'https://www.linkedin.com/in/stephenkantor/'),
  ('Chris Fiscalini', 'Senior Vice President, Relationship Manager', 'https://www.linkedin.com/in/chrisfiscalini'),
  ('Phoebe Casetta', 'Vice President, Commercial Banker, Middle Market Banking', 'https://www.linkedin.com/in/phoebecasetta/'),
  ('Andy Polancic', 'SVP, Bank of America Business Capital', 'https://www.linkedin.com/in/andy-polancic-6a198053'),
  ('David McLaughlin', 'Managing Director, Technology, Media and Telecom', 'https://www.linkedin.com/in/david-mclaughlin-8761b719/'),
  ('John Stevens', 'Technology Banking, Division Sales Executive', 'https://www.linkedin.com/in/john-stevens-52103924/'),
  ('Grier Ross', 'SVP, Chief Lending Officer - Middle Market Banking', 'https://www.linkedin.com/in/grier/'),
  ('Tai Hsia', 'CFO', 'https://www.linkedin.com/in/taihsia'),
  ('Jackie McIntosh', 'Executive Vice President of Capital Markets', NULL),
  ('Greg Wittreich', 'CFO', 'https://www.linkedin.com/in/greg-wittreich-ba48a920/'),
  ('Jason Moore', 'CEO', 'https://www.linkedin.com/in/jason-moore-02894050/'),
  ('Derick Sutton', 'Chief Financial Officer', 'https://www.linkedin.com/in/dericktsutton/'),
  ('Jackson Bunn', 'Vice President, New Business Originations', 'https://www.linkedin.com/in/jackson-bunn-cship-b7110730/'),
  ('Conrad Sean', 'EVP, Professional Services Group', 'https://www.linkedin.com/in/theseanconrad/'),
  ('Riley Retting', 'Senior Associate', 'https://www.linkedin.com/in/riley-rettig/'),
  ('Stauss Paulos', 'Executive Vice President of Sales', 'https://www.linkedin.com/in/stauss-paulos/'),
  ('Brandon Hodges', 'Managing Director, Business Development', 'https://www.linkedin.com/in/brandon-hodges-4740516/'),
  ('Animay Sharma', NULL, 'https://www.linkedin.com/in/animay-sharma/'),
  ('David Balcom', 'Business Development Officer', 'https://www.linkedin.com/in/david-balcom-db15/'),
  ('Eric DeHart', 'Market Director, Technology Finance', 'https://www.linkedin.com/in/deharteric/'),
  ('Zach Friedman', 'Vice President', 'https://www.linkedin.com/in/zach-friedman-a434b864/'),
  ('George Cairncross', 'Vice President', 'https://www.linkedin.com/in/george-cairncross/'),
  ('Blaise Golightly', 'Director', 'https://www.linkedin.com/in/j-blaise-golightly-90763227'),
  ('James Turner', 'Founder & CEO', 'https://www.linkedin.com/in/jamesturner-63109490/'),
  ('Josh Axler', 'Managing Director, Originations', 'https://www.linkedin.com/in/joshaxler/'),
  ('Matt Williams (CCA)', 'Vice President', 'https://www.linkedin.com/in/mwllms-cca/'),
  ('Dhvanit Patel', 'President and Chief Executive Officer', 'https://www.linkedin.com/in/dhvanit-a-patel-91ab8a11/'),
  ('Ifey Eke', 'Head of Partnerships', 'https://www.linkedin.com/in/ifeyceke/'),
  ('Daniel Godfrey', 'Senior Managing Director', 'https://www.linkedin.com/in/daniel-godfrey-18467b12/'),
  ('Rhett Bentley', 'Executive Vice President', 'https://www.linkedin.com/in/rhett-bentley-48661a17/'),
  ('Tom Novembrino', 'Principal/Co-Founder', 'https://www.linkedin.com/in/thomas-novembrino-3627376/'),
  ('Joseph Grodko', 'Founder and CEO', 'https://www.linkedin.com/in/joseph-grodko-3545b8147/'),
  ('Ned Post', NULL, 'https://www.linkedin.com/in/nedpost/'),
  ('Gary Edidin', 'CEO & Chairman', 'https://www.linkedin.com/in/gary-edidin/'),
  ('Tom Cleveland', 'Managing Partner', 'https://www.linkedin.com/in/tom-cleveland-3115816/'),
  ('Clinton Stanton', 'Co-Founder & Managing Partner', 'https://www.linkedin.com/in/clinton-stanton-a792b644'),
  ('Mike Miroshnikov', 'Chief Operating Officer & Chief Credit Officer', 'https://www.linkedin.com/in/mike-miroshnikov-03bb5a1/'),
  ('Kareem El Sawy', 'Founding Partner', 'https://www.linkedin.com/in/kareem-el-sawy-2b741511/'),
  ('Brady Falk', 'Associate Vice President, Investor Relations', 'https://www.linkedin.com/in/bfalk/'),
  ('Aznaur Midov', 'Investment Manager, Sustainable Investments', 'https://www.linkedin.com/in/aznaur-midov/'),
  ('Hal Berman', 'CEO', 'https://www.linkedin.com/in/hal-berman-ba3ab322'),
  ('Michael Hengl', 'Managing Director', 'https://www.linkedin.com/in/michael-hengl-1ba7666/'),
  ('Zane Hwang', 'Executive Director', 'https://www.linkedin.com/in/zanehwang/'),
  ('Selwyn Gordon', 'Strategic Partnerships Manager', 'https://www.linkedin.com/in/selgordon/'),
  ('Nitin Chandra', 'Managing Director', 'https://www.linkedin.com/in/nitin-chandra-a002043/'),
  ('Jessica Meksavan', NULL, 'https://www.linkedin.com/in/jessica-meksavan/'),
  ('Solomon Ibragimov', 'Senior General Partner', 'https://www.linkedin.com/in/solomon-ibragimov/'),
  ('Alex McCombs', 'Market Executive and Head of EXIM Bank Programs', 'https://www.linkedin.com/in/alex-mccombs-a8188743/'),
  ('Anthony Pena', 'Commercial Banking Leader, Middle Market', 'https://www.linkedin.com/in/anthony-pena-a09b78a/'),
  ('Alex Hoppe', 'Senior Vice President, Technology & Green Economy Banking', 'https://www.linkedin.com/in/hoppealexander/'),
  ('Charles Goldberg', 'Senior Vice President, Regional Credit Director', 'https://www.linkedin.com/in/charles-m-goldberg/'),
  ('Anthony Vassallo', 'Director, Crypto', 'https://www.linkedin.com/in/anthonyvassallo/'),
  ('Christopher Hart', 'Executive Director, Treasury Management Officer - Innovation Economy Treasury Services', 'https://www.linkedin.com/in/christopher-hart-24a6126/'),
  ('John Demaio', 'Managing Director, Fund Banking', 'https://www.linkedin.com/in/john-demaio-81a832/'),
  ('Dennis Regalado', 'Market Executive, Innovation Economy - Technology', 'https://www.linkedin.com/in/dr24bear/'),
  ('Henry Li', 'Director, Corporate Banking - Technology, Media & Telecom', 'https://www.linkedin.com/in/henrylli/'),
  ('Jenn Walker', 'Leverage Finance, Sponsor Coverage', 'https://www.linkedin.com/in/jennbwalker/'),
  ('Jake Ganajian', 'Commercial Banking Market Executive', 'https://www.linkedin.com/in/jake-ganajian-24b35217'),
  ('James Kang', 'SVP, Treasury Management', 'https://www.linkedin.com/in/james-k-47b571a'),
  ('Jamie Fracchia', 'Vice President, Portfolio Manager III', 'https://www.linkedin.com/in/jamie-fracchia-20789b73'),
  ('Kayla Shirakhon', 'Vice President, Business Development Officer', 'https://www.linkedin.com/in/kaylashirakhon/'),
  ('Kirk Westbrook', 'Senior Credit Officer', 'https://www.linkedin.com/in/kirk-westbrook-848117/'),
  ('Julie Bloomfield', NULL, 'https://www.linkedin.com/in/julie-bloomfield-beckley-36a06a19/'),
  ('Matt Wysong', 'Managing Director, Technology, Media and Telecom', 'https://www.linkedin.com/in/matt-wysong-6312465/'),
  ('John Mulhern', 'Talent Acquisition Team Lead', 'https://www.linkedin.com/in/johnfmulhernjr/'),
  ('John Sartori', 'ABL Originator', 'https://www.linkedin.com/in/johnsartoricfa/'),
  ('Kim Crosslin', 'Commercial Banking Leader, Middle Market Technology Banking Team', 'https://www.linkedin.com/in/kim-crosslin-7318662/'),
  ('Kevin Zeidan', 'Managing Director', 'https://www.linkedin.com/in/zeidan/'),
  ('Nate Hughes', 'Director, Technology Banking', 'https://www.linkedin.com/in/nathanshughes/'),
  ('Sean Copley', 'Managing Director', 'https://www.linkedin.com/in/sean-copley-a177795/'),
  ('Mehdi Emrani', NULL, 'https://www.linkedin.com/in/mehdi-emrani/'),
  ('Richard Adams', 'Senior Relationship Manager, Global Technology', 'https://www.linkedin.com/in/richard-adams-cfa-3492522/'),
  ('Steve Smith', 'Commercial Banking Manager', 'https://www.linkedin.com/in/steve-smith-6b75334/');

-- Capture which rows will be updated for reporting
CREATE TEMP TABLE _blount_jobs_result AS
WITH updated AS (
  UPDATE public.contacts c
     SET job_title    = COALESCE(NULLIF(btrim(b.job_title), ''), c.job_title),
         linkedin_url = COALESCE(NULLIF(btrim(b.linkedin_url), ''), c.linkedin_url),
         updated_at   = now()
    FROM _blount_jobs b
   WHERE c.org_company_id = 'c4753066-0da9-4d87-8858-7eb1adecd173'
     AND lower(btrim(c.full_name)) = lower(btrim(b.full_name))
  RETURNING c.id, b.full_name
)
SELECT * FROM updated;

-- Report into a persistent log so we can read counts afterwards
CREATE TABLE IF NOT EXISTS public._migration_log_blount_jobs (
  ran_at timestamptz DEFAULT now(),
  rows_updated int,
  names_matched int,
  names_in_list int,
  names_skipped int
);

INSERT INTO public._migration_log_blount_jobs (rows_updated, names_matched, names_in_list, names_skipped)
SELECT
  (SELECT count(DISTINCT id) FROM _blount_jobs_result),
  (SELECT count(DISTINCT full_name) FROM _blount_jobs_result),
  (SELECT count(*) FROM _blount_jobs),
  (SELECT count(*) FROM _blount_jobs b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.contacts c
        WHERE c.org_company_id = 'c4753066-0da9-4d87-8858-7eb1adecd173'
          AND lower(btrim(c.full_name)) = lower(btrim(b.full_name))));
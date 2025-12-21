-- Revoke all table privileges from anonymous role to prevent unauthenticated access
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
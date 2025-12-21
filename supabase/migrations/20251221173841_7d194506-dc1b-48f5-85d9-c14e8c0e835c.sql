-- Revoke all table privileges from anonymous role to prevent unauthenticated reads/writes
REVOKE ALL PRIVILEGES ON TABLE public.login_history FROM anon;

-- (Optional hardening) Keep authenticated access as-is; RLS still enforces per-user access.

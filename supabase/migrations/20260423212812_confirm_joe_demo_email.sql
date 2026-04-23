-- Auto-confirm Joe Rossi's demo account email so he can log in immediately
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
    confirmed_at       = COALESCE(confirmed_at, now())
WHERE email = 'joe@turbine.co';

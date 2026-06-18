UPDATE auth.identities
SET identity_data = jsonb_set(jsonb_set(identity_data, '{email}', '"Polly@blountcapital.com"'), '{email_verified}', 'true'),
    updated_at = now()
WHERE user_id = '89633b95-435b-4afa-a0ba-21d5866e9dfc' AND provider = 'email';
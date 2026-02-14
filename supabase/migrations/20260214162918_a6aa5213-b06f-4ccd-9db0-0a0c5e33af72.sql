
-- Create a function to validate email domains on user creation
CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  email_domain TEXT;
  blocked_domains TEXT[] := ARRAY[
    'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com', 'rocketmail.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com',
    'proton.me', 'protonmail.com', 'tutanota.com', 'tutamail.com', 'tuta.io',
    'gmx.com', 'gmx.us', 'gmx.de', 'web.de', 'laposte.net',
    'mail.com', 'yandex.com', 'yandex.ru', 'seznam.cz',
    '163.com', '126.com', 'qq.com', 'lycos.com', 'inbox.com',
    'zoho.com', 'zohomail.com'
  ];
BEGIN
  user_email := lower(NEW.email);
  email_domain := split_part(user_email, '@', 2);
  
  IF email_domain = ANY(blocked_domains) THEN
    RAISE EXCEPTION 'Personal email addresses are not allowed. Please use your work email.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Note: We cannot attach triggers to auth.users (reserved schema).
-- The validation is enforced client-side and in the AuthContext.
-- This function is available for use in edge functions if needed.

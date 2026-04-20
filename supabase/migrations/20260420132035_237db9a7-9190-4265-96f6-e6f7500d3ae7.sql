-- Create personal "From James" label for Niki Heikali, plus auto-tag rules.
-- Idempotent: safe to re-run.
DO $$
DECLARE
  _niki uuid := 'a757f375-7e93-4fc5-a49e-e371abb42fac';
  _label_id uuid;
BEGIN
  -- Find existing label (personal, owned by Niki)
  SELECT id INTO _label_id
  FROM public.email_labels
  WHERE scope = 'user' AND user_id = _niki AND name = 'From James'
  LIMIT 1;

  IF _label_id IS NULL THEN
    INSERT INTO public.email_labels (name, color, description, is_default, scope, user_id, company_id, position)
    VALUES ('From James', '#3b82f6', 'Auto-applied to any email involving James Turner (direct, replies, or forwards).', false, 'user', _niki, NULL, 0)
    RETURNING id INTO _label_id;
  END IF;

  -- Rule 1: sender_email contains jturner@5thline.co (direct + reply chains)
  IF NOT EXISTS (
    SELECT 1 FROM public.email_label_rules
    WHERE label_id = _label_id AND field = 'sender_email' AND operator = 'contains' AND value = 'jturner@5thline.co'
  ) THEN
    INSERT INTO public.email_label_rules (label_id, field, operator, value, is_active)
    VALUES (_label_id, 'sender_email', 'contains', 'jturner@5thline.co', true);
  END IF;

  -- Rule 2: subject contains jturner@5thline.co (some forwards quote the address)
  IF NOT EXISTS (
    SELECT 1 FROM public.email_label_rules
    WHERE label_id = _label_id AND field = 'subject' AND operator = 'contains' AND value = 'jturner@5thline.co'
  ) THEN
    INSERT INTO public.email_label_rules (label_id, field, operator, value, is_active)
    VALUES (_label_id, 'subject', 'contains', 'jturner@5thline.co', true);
  END IF;

  -- Rule 3: body contains jturner@5thline.co (forwards by others include the original From: line)
  IF NOT EXISTS (
    SELECT 1 FROM public.email_label_rules
    WHERE label_id = _label_id AND field = 'body' AND operator = 'contains' AND value = 'jturner@5thline.co'
  ) THEN
    INSERT INTO public.email_label_rules (label_id, field, operator, value, is_active)
    VALUES (_label_id, 'body', 'contains', 'jturner@5thline.co', true);
  END IF;
END $$;
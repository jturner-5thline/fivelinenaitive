-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_audit_log_contact_id_created_at
  ON public.contact_audit_log (contact_id, created_at DESC);

-- 2) Grants
GRANT SELECT ON public.contact_audit_log TO authenticated;
GRANT ALL ON public.contact_audit_log TO service_role;

-- 3) RLS
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view contact audit log"
ON public.contact_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contacts c
    JOIN public.company_members cm ON cm.company_id = c.org_company_id
    WHERE c.id = contact_audit_log.contact_id AND cm.user_id = auth.uid()
  )
  OR public.is_5thline_user(auth.uid())
);

-- 4) Trigger function
CREATE OR REPLACE FUNCTION public.tg_contacts_write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  ignore_fields TEXT[] := ARRAY[
    'updated_at', 'created_at', 'last_activity_date',
    'hubspot_properties', 'hubspot_last_synced_at', 'last_synced_at'
  ];
  k TEXT;
  old_v JSONB;
  new_v JSONB;
  old_text TEXT;
  new_text TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contact_audit_log (contact_id, actor_user_id, action)
    VALUES (NEW.id, actor, 'created');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.contact_audit_log (contact_id, actor_user_id, action)
    VALUES (OLD.id, actor, 'deleted');
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR k, new_v IN SELECT * FROM jsonb_each(to_jsonb(NEW)) LOOP
      IF k = ANY(ignore_fields) THEN CONTINUE; END IF;
      old_v := to_jsonb(OLD) -> k;
      IF new_v IS DISTINCT FROM old_v THEN
        old_text := CASE WHEN old_v IS NULL OR jsonb_typeof(old_v) = 'null' THEN NULL
                         WHEN jsonb_typeof(old_v) = 'string' THEN old_v #>> '{}'
                         ELSE old_v::text END;
        new_text := CASE WHEN new_v IS NULL OR jsonb_typeof(new_v) = 'null' THEN NULL
                         WHEN jsonb_typeof(new_v) = 'string' THEN new_v #>> '{}'
                         ELSE new_v::text END;
        -- Truncate very large values to keep log rows manageable
        IF old_text IS NOT NULL AND length(old_text) > 2000 THEN
          old_text := left(old_text, 2000) || '…';
        END IF;
        IF new_text IS NOT NULL AND length(new_text) > 2000 THEN
          new_text := left(new_text, 2000) || '…';
        END IF;
        INSERT INTO public.contact_audit_log
          (contact_id, actor_user_id, action, field, old_value, new_value)
        VALUES (NEW.id, actor, 'updated', k, old_text, new_text);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- 5) Triggers
DROP TRIGGER IF EXISTS trg_contacts_audit_insert ON public.contacts;
CREATE TRIGGER trg_contacts_audit_insert
AFTER INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_write_audit_log();

DROP TRIGGER IF EXISTS trg_contacts_audit_update ON public.contacts;
CREATE TRIGGER trg_contacts_audit_update
AFTER UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_write_audit_log();

DROP TRIGGER IF EXISTS trg_contacts_audit_delete ON public.contacts;
CREATE TRIGGER trg_contacts_audit_delete
AFTER DELETE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_write_audit_log();
ALTER TABLE public.admin_agent_knowledge_docs REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_agent_knowledge_docs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
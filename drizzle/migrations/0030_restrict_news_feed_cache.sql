DROP POLICY IF EXISTS "Authenticated users can read news cache" ON public.news_feed_cache;
REVOKE SELECT ON public.news_feed_cache FROM authenticated, anon;
GRANT ALL ON public.news_feed_cache TO service_role;
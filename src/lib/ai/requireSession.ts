import { supabase } from '@/integrations/supabase/client';

/**
 * Edge functions that validate `auth.getUser()` return 401 when the caller has
 * no session (e.g. signed-out / on /auth). Callers should skip the invoke
 * entirely in that case instead of surfacing an "Unauthorized" runtime error.
 */
export async function hasAuthSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.access_token;
}

-- Fix the deals SELECT policy to properly restrict visibility
-- The "Require authentication for deals" policy was acting as a permissive catch-all
-- We need to drop it and rely only on the ownership-based policy

-- Drop the overly permissive authentication policy
DROP POLICY IF EXISTS "Require authentication for deals" ON public.deals;

-- The "Users can view deals" policy already checks proper ownership/company membership
-- and will now be the only SELECT policy, properly restricting access
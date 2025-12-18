-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Add user_id column to deals table
ALTER TABLE public.deals 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to deal_lenders via deal relationship (already inherits from deals)

-- Add user_id to outstanding_items
ALTER TABLE public.outstanding_items
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to deal_attachments  
ALTER TABLE public.deal_attachments
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing permissive policies on deals
DROP POLICY IF EXISTS "Anyone can view deals" ON public.deals;
DROP POLICY IF EXISTS "Anyone can create deals" ON public.deals;
DROP POLICY IF EXISTS "Anyone can update deals" ON public.deals;
DROP POLICY IF EXISTS "Anyone can delete deals" ON public.deals;

-- Create user-scoped policies for deals
CREATE POLICY "Users can view their own deals"
ON public.deals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deals"
ON public.deals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own deals"
ON public.deals FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deals"
ON public.deals FOR DELETE
USING (auth.uid() = user_id);

-- Drop existing policies on deal_lenders
DROP POLICY IF EXISTS "Anyone can view deal_lenders" ON public.deal_lenders;
DROP POLICY IF EXISTS "Anyone can create deal_lenders" ON public.deal_lenders;
DROP POLICY IF EXISTS "Anyone can update deal_lenders" ON public.deal_lenders;
DROP POLICY IF EXISTS "Anyone can delete deal_lenders" ON public.deal_lenders;

-- User-scoped policies for deal_lenders (via deal ownership)
CREATE POLICY "Users can view lenders of their deals"
ON public.deal_lenders FOR SELECT
USING (EXISTS (SELECT 1 FROM public.deals WHERE deals.id = deal_lenders.deal_id AND deals.user_id = auth.uid()));

CREATE POLICY "Users can create lenders for their deals"
ON public.deal_lenders FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.deals WHERE deals.id = deal_lenders.deal_id AND deals.user_id = auth.uid()));

CREATE POLICY "Users can update lenders of their deals"
ON public.deal_lenders FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.deals WHERE deals.id = deal_lenders.deal_id AND deals.user_id = auth.uid()));

CREATE POLICY "Users can delete lenders of their deals"
ON public.deal_lenders FOR DELETE
USING (EXISTS (SELECT 1 FROM public.deals WHERE deals.id = deal_lenders.deal_id AND deals.user_id = auth.uid()));

-- Drop existing policies on outstanding_items
DROP POLICY IF EXISTS "Anyone can view outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Anyone can create outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Anyone can update outstanding_items" ON public.outstanding_items;
DROP POLICY IF EXISTS "Anyone can delete outstanding_items" ON public.outstanding_items;

-- User-scoped policies for outstanding_items
CREATE POLICY "Users can view their own outstanding_items"
ON public.outstanding_items FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own outstanding_items"
ON public.outstanding_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own outstanding_items"
ON public.outstanding_items FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own outstanding_items"
ON public.outstanding_items FOR DELETE
USING (auth.uid() = user_id);

-- Drop existing policies on deal_attachments
DROP POLICY IF EXISTS "Anyone can view attachments" ON public.deal_attachments;
DROP POLICY IF EXISTS "Anyone can upload attachments" ON public.deal_attachments;
DROP POLICY IF EXISTS "Anyone can delete attachments" ON public.deal_attachments;

-- User-scoped policies for deal_attachments
CREATE POLICY "Users can view their own attachments"
ON public.deal_attachments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own attachments"
ON public.deal_attachments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attachments"
ON public.deal_attachments FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
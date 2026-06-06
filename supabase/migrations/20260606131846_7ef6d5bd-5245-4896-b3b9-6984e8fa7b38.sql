CREATE POLICY "Users can update their own notification reads"
ON public.notification_reads
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
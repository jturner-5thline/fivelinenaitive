import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UploadJob {
  id: string;
  deal_id: string;
  initiated_by: string;
  job_type: 'single' | 'multi' | 'folder' | 'zip';
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  total_files_detected: number;
  files_uploaded_successfully: number;
  files_failed: number;
  initiated_at: string;
  completed_at: string | null;
}

export function useUploadJobs(dealId: string | null) {
  const { user } = useAuth();
  const [activeJob, setActiveJob] = useState<UploadJob | null>(null);

  const createJob = useCallback(async (
    jobType: UploadJob['job_type'],
    totalFiles: number
  ): Promise<UploadJob | null> => {
    if (!user || !dealId) return null;
    try {
      const { data, error } = await supabase
        .from('upload_jobs')
        .insert({
          deal_id: dealId,
          initiated_by: user.id,
          job_type: jobType,
          total_files_detected: totalFiles,
        })
        .select()
        .single();
      if (error) throw error;
      const job = data as UploadJob;
      setActiveJob(job);
      return job;
    } catch (err) {
      console.error('Error creating upload job:', err);
      return null;
    }
  }, [user, dealId]);

  const updateJob = useCallback(async (
    jobId: string,
    updates: Partial<Pick<UploadJob, 'status' | 'files_uploaded_successfully' | 'files_failed' | 'completed_at'>>
  ) => {
    try {
      const { error } = await supabase
        .from('upload_jobs')
        .update(updates)
        .eq('id', jobId);
      if (error) throw error;
      setActiveJob(prev => prev?.id === jobId ? { ...prev, ...updates } : prev);
    } catch (err) {
      console.error('Error updating upload job:', err);
    }
  }, []);

  const completeJob = useCallback(async (
    jobId: string,
    successCount: number,
    failCount: number
  ) => {
    const status = failCount === 0 ? 'completed' 
      : successCount === 0 ? 'failed' 
      : 'completed_with_errors';
    await updateJob(jobId, {
      status,
      files_uploaded_successfully: successCount,
      files_failed: failCount,
      completed_at: new Date().toISOString(),
    });
    setTimeout(() => setActiveJob(null), 3000);
  }, [updateJob]);

  return { activeJob, createJob, updateJob, completeJob };
}

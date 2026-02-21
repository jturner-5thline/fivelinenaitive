import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string | null;
  uploaded_by: string;
  created_at: string;
}

export function useTaskAttachments(taskId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['task-attachments', taskId];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TaskAttachment[];
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!user || !taskId) throw new Error('Missing context');
      const filePath = `${taskId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        content_type: file.type || null,
        uploaded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success('File uploaded');
    },
    onError: () => toast.error('Failed to upload file'),
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: TaskAttachment) => {
      await supabase.storage.from('task-attachments').remove([attachment.file_path]);
      const { error } = await supabase.from('task_attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success('File deleted');
    },
  });

  const getDownloadUrl = async (filePath: string) => {
    const { data } = await supabase.storage
      .from('task-attachments')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl || '';
  };

  return { attachments, isLoading, uploadAttachment, deleteAttachment, getDownloadUrl };
}

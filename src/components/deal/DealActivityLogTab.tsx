import { useCallback } from 'react';
import { useDealAuditLog } from '@/hooks/useDealAuditLog';
import { DealAuditLogPanel } from '@/components/deal/DealAuditLogPanel';
import { DealCorrectionsButton } from '@/components/deal/DealCorrectionsButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DealAuditEntry } from '@/hooks/useDealAuditLog';

interface DealActivityLogTabProps {
  dealId: string;
}

export function DealActivityLogTab({ dealId }: DealActivityLogTabProps) {
  const { entries, unresolvedStageEntries, loading, hasMore, loadMore, logAuditAction, refetch } = useDealAuditLog(dealId);

  const handleRestore = useCallback(async (entry: DealAuditEntry) => {
    if (!entry.entity_id) return;
    try {
      await (supabase as any).from('vdr_documents')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', entry.entity_id);
      
      await logAuditAction('file_restored', 'file', entry.entity_id, entry.entity_name || undefined, {
        restored_from_audit: entry.id,
      });
      toast.success(`Restored "${entry.entity_name || 'file'}"`);
      refetch();
    } catch (err) {
      console.error('Restore error:', err);
      toast.error('Failed to restore file');
    }
  }, [logAuditAction, refetch]);

  const handleRevert = useCallback(async (entry: DealAuditEntry) => {
    if (!entry.entity_id) return;
    const meta = entry.metadata || {};
    try {
      if (entry.action_type === 'file_moved' && meta.old_folder) {
        await (supabase as any).from('vdr_documents')
          .update({ folder_path: meta.old_folder })
          .eq('id', entry.entity_id);
        await logAuditAction('move_reverted', 'file', entry.entity_id, entry.entity_name || undefined, {
          old_folder: meta.new_folder, new_folder: meta.old_folder,
        });
        toast.success(`Reverted move — "${entry.entity_name}" back to ${meta.old_folder}`);
      } else if ((entry.action_type === 'file_renamed' || entry.action_type === 'folder_renamed') && meta.old_name) {
        await (supabase as any).from('vdr_documents')
          .update({ filename: meta.old_name })
          .eq('id', entry.entity_id);
        await logAuditAction('rename_reverted', entry.entity_type, entry.entity_id, meta.old_name, {
          old_name: meta.new_name, new_name: meta.old_name,
        });
        toast.success(`Reverted rename — back to "${meta.old_name}"`);
      }
      refetch();
    } catch (err) {
      console.error('Revert error:', err);
      toast.error('Failed to revert action');
    }
  }, [logAuditAction, refetch]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-4 pb-2">
        <DealCorrectionsButton dealId={dealId} />
      </div>
      <DealAuditLogPanel
        entries={entries}
        unresolvedStageEntries={unresolvedStageEntries}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onRestore={handleRestore}
        onRevert={handleRevert}
      />
    </div>
  );
}

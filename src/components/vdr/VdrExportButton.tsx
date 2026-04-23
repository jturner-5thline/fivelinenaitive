import { useState, useCallback } from 'react';
import { Download, ShieldAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { VdrDocument } from './types';

interface VdrExportButtonProps {
  dealId: string;
  dealName: string;
  documents: VdrDocument[];
  isDataroomView: boolean;
}

export function VdrExportButton({ dealId, dealName, documents, isDataroomView }: VdrExportButtonProps) {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Get files to export based on view
  const filesToExport = documents.filter(d => {
    if (d.is_folder) return false;
    if (isDataroomView) return d.shared_to_dataroom;
    return true;
  });

  const handleExport = useCallback(async () => {
    if (!user || filesToExport.length === 0) return;

    setIsExporting(true);
    setProgress(0);

    try {
      const zip = new JSZip();
      let completed = 0;

      for (const doc of filesToExport) {
        if (!doc.file_path) continue;

        const { data: signedData } = await supabase.storage
          .from('vdr-files')
          .createSignedUrl(doc.file_path, 300);

        if (signedData?.signedUrl) {
          const response = await fetch(signedData.signedUrl);
          const blob = await response.blob();

          // Preserve folder structure
          const folderPrefix = doc.folder_path === '/' ? '' : doc.folder_path.replace(/^\//, '').replace(/\/$/, '') + '/';
          zip.file(`${folderPrefix}${doc.filename}`, blob);
        }

        completed++;
        setProgress(Math.round((completed / filesToExport.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const dateStr = new Date().toISOString().split('T')[0];
      const roomType = isDataroomView ? 'DataRoom' : 'Internal';
      const safeName = dealName.replace(/[^a-zA-Z0-9_-]/g, '_');
      saveAs(zipBlob, `${safeName}_${roomType}_Export_${dateStr}.zip`);

      // Audit log
      await supabase.from('data_room_exports').insert({
        user_id: user.id,
        deal_id: dealId,
        data_room_type: isDataroomView ? 'external' : 'internal',
        file_count: filesToExport.length,
      });

      toast.success(`Exported ${filesToExport.length} files`);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
      setShowWarning(false);
      setProgress(0);
    }
  }, [user, filesToExport, dealId, dealName, isDataroomView]);

  if (filesToExport.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setShowWarning(true)}
        title="Export data room"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={showWarning} onOpenChange={open => { if (!isExporting) setShowWarning(open); }}>
        <AlertDialogContent>
          {isExporting ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Exporting {filesToExport.length} files…</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">{progress}% complete</p>
            </div>
          ) : (
            <>
              <AlertDialogHeader>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  <AlertDialogTitle>Security Notice</AlertDialogTitle>
                </div>
                <AlertDialogDescription className="pt-2">
                  You are exporting data outside of a secure environment. Downloaded files will no longer be protected by naitive's access controls. Are you sure you want to proceed?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleExport}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirm Export
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

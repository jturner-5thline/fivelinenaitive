import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, FileStack, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface MigrateDealsDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  userId: string;
}

export function MigrateDealsDialog({
  open,
  onClose,
  companyId,
  companyName,
  userId,
}: MigrateDealsDialogProps) {
  const [personalDealsCount, setPersonalDealsCount] = useState<number | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && userId) {
      checkPersonalDeals();
    }
  }, [open, userId]);

  const checkPersonalDeals = async () => {
    setIsLoading(true);
    try {
      // Count deals owned by user that don't belong to any company
      const { count, error } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('company_id', null);

      if (error) throw error;
      setPersonalDealsCount(count || 0);
    } catch (error) {
      console.error('Error checking personal deals:', error);
      setPersonalDealsCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      // Update all personal deals to belong to the company and mark as migrated
      const { error } = await supabase
        .from('deals')
        .update({ company_id: companyId, migrated_from_personal: true })
        .eq('user_id', userId)
        .is('company_id', null);

      if (error) throw error;

      toast({
        title: 'Deals migrated',
        description: `${personalDealsCount} deal${personalDealsCount !== 1 ? 's' : ''} have been moved to ${companyName}.`,
      });
      onClose();
    } catch (error: any) {
      console.error('Error migrating deals:', error);
      toast({
        title: 'Migration failed',
        description: error.message || 'Failed to migrate deals',
        variant: 'destructive',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // If no personal deals, auto-close
  useEffect(() => {
    if (!isLoading && personalDealsCount === 0 && open) {
      onClose();
    }
  }, [isLoading, personalDealsCount, open, onClose]);

  if (isLoading) {
    return (
      <AlertDialog open={open}>
        <AlertDialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (personalDealsCount === 0) {
    return null;
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <FileStack className="h-6 w-6 text-primary" />
            <AlertDialogTitle>Migrate Personal Deals?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3">
            <p>
              You have <strong>{personalDealsCount} personal deal{personalDealsCount !== 1 ? 's' : ''}</strong> that 
              {personalDealsCount !== 1 ? ' are' : ' is'} not associated with any company.
            </p>
            <p>
              Would you like to move {personalDealsCount !== 1 ? 'them' : 'it'} to <strong>{companyName}</strong>? 
              This will make {personalDealsCount !== 1 ? 'them' : 'it'} visible to all team members.
            </p>
            <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                This action cannot be undone. You can always choose to skip and keep your deals private.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isMigrating}>
            Keep Separate
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleMigrate} disabled={isMigrating}>
            {isMigrating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Migrating...
              </>
            ) : (
              `Migrate ${personalDealsCount} Deal${personalDealsCount !== 1 ? 's' : ''}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

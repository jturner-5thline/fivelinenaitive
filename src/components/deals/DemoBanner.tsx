import { useState, useEffect } from 'react';
import { Info, Trash2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface DemoBannerProps {
  onDataCleared?: () => void;
}

export function DemoBanner({ onDataCleared }: DemoBannerProps) {
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isReseeding, setIsReseeding] = useState(false);

  useEffect(() => {
    const checkDemoUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'demo@example.com') {
        setIsDemoUser(true);
      }
    };
    checkDemoUser();
  }, []);

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete all deals for this user (lenders will cascade)
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Demo data cleared',
        description: 'All demo deals have been removed. You can start fresh!',
      });

      onDataCleared?.();
    } catch (error: any) {
      toast({
        title: 'Error clearing data',
        description: error.message || 'Failed to clear demo data',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleReseedData = async () => {
    setIsReseeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-demo-data', {
        body: { force: true },
      });

      if (error) throw error;

      toast({
        title: 'Demo data refreshed',
        description: `${data?.dealsCreated || 7} demo deals have been created.`,
      });

      onDataCleared?.();
    } catch (error: any) {
      toast({
        title: 'Error re-seeding data',
        description: error.message || 'Failed to re-seed demo data',
        variant: 'destructive',
      });
    } finally {
      setIsReseeding(false);
    }
  };

  if (!isDemoUser) {
    return null;
  }

  return (
    <div className="relative rounded-lg border border-brand/30 bg-brand/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 text-brand mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            You're exploring the demo
          </p>
          <p className="text-sm text-muted-foreground">
            This account contains sample deals to help you explore the app. Feel free to edit, add, or delete deals. 
            You can also clear all demo data to start fresh.
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Button 
              variant="gradient" 
              size="sm" 
              className="gap-2"
              onClick={() => {
                localStorage.removeItem('demo-tour-completed');
                window.dispatchEvent(new Event('restart-demo-tour'));
              }}
            >
              <Play className="h-3.5 w-3.5" />
              Restart tour
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="gradient" size="sm" className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-seed demo data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Re-seed demo data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all existing deals and create fresh demo data. 
                    This is useful for testing or starting over with the original sample deals.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReseedData}
                    disabled={isReseeding}
                  >
                    {isReseeding ? 'Re-seeding...' : 'Re-seed data'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="gradient" size="sm" className="gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear demo data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all demo data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all deals and lenders in the demo account. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearData}
                    disabled={isClearing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isClearing ? 'Clearing...' : 'Clear all data'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}

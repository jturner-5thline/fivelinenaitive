import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';
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
  const [dismissed, setDismissed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const checkDemoUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'demo@example.com') {
        setIsDemoUser(true);
        // Check if banner was dismissed this session
        const wasDismissed = sessionStorage.getItem('demo-banner-dismissed');
        if (wasDismissed) {
          setDismissed(true);
        }
      }
    };
    checkDemoUser();
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('demo-banner-dismissed', 'true');
  };

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

  if (!isDemoUser || dismissed) {
    return null;
  }

  return (
    <div className="relative rounded-lg border border-brand/30 bg-brand/5 p-4 mb-4">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
      
      <div className="flex items-start gap-3 pr-8">
        <Info className="h-5 w-5 text-brand mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            You're exploring the demo
          </p>
          <p className="text-sm text-muted-foreground">
            This account contains sample deals to help you explore the app. Feel free to edit, add, or delete deals. 
            You can also clear all demo data to start fresh.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="mt-1">
                Create my own deals
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
  );
}

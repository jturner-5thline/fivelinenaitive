import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface DemoRestrictionBannerProps {
  action: string;
  className?: string;
}

export function DemoRestrictionBanner({ action, className = '' }: DemoRestrictionBannerProps) {
  return (
    <Alert variant="destructive" className={`border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 ${className}`}>
      <ShieldAlert className="h-4 w-4 !text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-300">Demo Account Restriction</AlertTitle>
      <AlertDescription className="text-amber-600 dark:text-amber-400">
        {action} is not available for demo accounts. Sign up for a full account to access this feature.
      </AlertDescription>
    </Alert>
  );
}

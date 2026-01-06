import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';

export function DemoModeBadge() {
  const { user } = useAuth();
  const isDemoUser = user?.email === 'demo@example.com';

  if (!isDemoUser) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 cursor-help"
          >
            <FlaskConical className="h-3 w-3" />
            Demo Mode
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-sm">
            You're exploring with sample data. Feel free to experiment—changes won't affect real accounts.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

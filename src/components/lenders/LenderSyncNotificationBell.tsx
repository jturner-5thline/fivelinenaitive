import { Bell } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLenderSyncRequests } from '@/hooks/useLenderSyncRequests';
import { useCanSeeFlexSync } from '@/hooks/useCanSeeFlexSync';

export function LenderSyncNotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canSeeFlexSync } = useCanSeeFlexSync();
  const { pendingCount } = useLenderSyncRequests();

  // Only show for authorized users with pending sync requests
  if (!canSeeFlexSync || pendingCount === 0) return null;

  const handleClick = () => {
    // If already on lenders page, just ensure panel is visible (handled by parent)
    // Otherwise navigate to lenders page
    if (location.pathname !== '/lenders') {
      navigate('/lenders');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleClick}
          className="relative h-9 w-9"
        >
          <Bell className="h-4 w-4" />
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full text-xs px-1.5 animate-pulse"
          >
            {pendingCount}
          </Badge>
          <span className="sr-only">{pendingCount} pending lender sync requests</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{pendingCount} pending lender sync request{pendingCount !== 1 ? 's' : ''} from FLEx</p>
      </TooltipContent>
    </Tooltip>
  );
}


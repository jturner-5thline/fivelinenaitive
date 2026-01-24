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

export function LenderSyncNotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pendingCount } = useLenderSyncRequests();

  // Only show if there are pending sync requests
  if (pendingCount === 0) return null;

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
          variant="ghost"
          size="icon"
          onClick={handleClick}
          className="relative"
        >
          <Bell className="h-5 w-5" />
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


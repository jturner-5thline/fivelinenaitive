import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMyDealNotifications } from '@/hooks/useMyDealNotifications';

export function DealManagementNotificationBell() {
  const navigate = useNavigate();
  const { count } = useMyDealNotifications();

  if (count === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate('/')}
          className="relative h-9 w-9"
        >
          <Bell className="h-4 w-4" />
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full text-xs px-1.5"
          >
            {count}
          </Badge>
          <span className="sr-only">{count} deal management notification{count !== 1 ? 's' : ''}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{count} deal management item{count !== 1 ? 's' : ''} need your attention</p>
      </TooltipContent>
    </Tooltip>
  );
}

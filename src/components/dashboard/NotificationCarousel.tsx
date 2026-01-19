import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, AlertCircle, Calendar, FileText, Users, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface Notification {
  id: string;
  type: 'reminder' | 'deal' | 'alert' | 'lender' | 'milestone';
  title: string;
  description: string;
  dealId?: string;
  dealName?: string;
  timestamp: Date;
  priority?: 'low' | 'medium' | 'high';
}

// Mock notifications for demo - replace with real data hook
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'reminder',
    title: 'Follow up with Acme Corp',
    description: 'Scheduled reminder to check on term sheet status',
    dealId: '1',
    dealName: 'Acme Corp',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    priority: 'high',
  },
  {
    id: '2',
    type: 'deal',
    title: 'Deal Stage Updated',
    description: 'TechStart Inc moved to Due Diligence stage',
    dealId: '2',
    dealName: 'TechStart Inc',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    priority: 'medium',
  },
  {
    id: '3',
    type: 'lender',
    title: 'New Lender Response',
    description: 'Capital Bank has submitted initial interest',
    dealId: '3',
    dealName: 'GlobalTech Solutions',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    priority: 'medium',
  },
  {
    id: '4',
    type: 'milestone',
    title: 'Milestone Due Tomorrow',
    description: 'Financial documents submission deadline',
    dealId: '1',
    dealName: 'Acme Corp',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    priority: 'high',
  },
  {
    id: '5',
    type: 'alert',
    title: 'Stale Deal Alert',
    description: 'No activity for 14 days on this deal',
    dealId: '4',
    dealName: 'Venture Labs',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    priority: 'low',
  },
];

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'reminder':
      return Calendar;
    case 'deal':
      return FileText;
    case 'lender':
      return Users;
    case 'alert':
      return AlertCircle;
    case 'milestone':
      return Clock;
    default:
      return Bell;
  }
};

const getNotificationColor = (type: Notification['type']) => {
  switch (type) {
    case 'reminder':
      return 'bg-primary/10 text-primary';
    case 'deal':
      return 'bg-success/20 text-success';
    case 'lender':
      return 'bg-accent/50 text-accent-foreground';
    case 'alert':
      return 'bg-destructive/10 text-destructive';
    case 'milestone':
      return 'bg-warning/20 text-warning';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getPriorityBadge = (priority?: Notification['priority']) => {
  switch (priority) {
    case 'high':
      return <Badge variant="destructive" className="text-xs">High</Badge>;
    case 'medium':
      return <Badge variant="secondary" className="text-xs">Medium</Badge>;
    case 'low':
      return <Badge variant="outline" className="text-xs">Low</Badge>;
    default:
      return null;
  }
};

export function NotificationCarousel() {
  const navigate = useNavigate();
  const notifications = mockNotifications;

  if (notifications.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications at this time</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium text-foreground">Notifications</h3>
          <Badge variant="secondary" className="ml-1">{notifications.length}</Badge>
        </div>
      </div>
      
      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {notifications.map((notification) => {
            const IconComponent = getNotificationIcon(notification.type);
            const colorClass = getNotificationColor(notification.type);

            return (
              <CarouselItem key={notification.id} className="pl-2 md:pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
                <Card 
                  className="h-full cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => notification.dealId && navigate(`/deal/${notification.dealId}`)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`p-2 rounded-lg ${colorClass}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      {getPriorityBadge(notification.priority)}
                    </div>
                    
                    <div className="space-y-1">
                      <h4 className="font-medium text-sm text-foreground line-clamp-1">
                        {notification.title}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {notification.dealName && (
                        <span className="text-xs text-primary font-medium truncate max-w-[120px]">
                          {notification.dealName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious className="hidden sm:flex -left-4 h-8 w-8" />
        <CarouselNext className="hidden sm:flex -right-4 h-8 w-8" />
      </Carousel>
    </div>
  );
}

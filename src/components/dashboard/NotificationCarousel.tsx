import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, AlertCircle, Calendar, FileText, Users, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    description: 'Scheduled reminder to check on term sheet status. The lender has been reviewing documents for over a week.',
    dealId: '1',
    dealName: 'Acme Corp',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    priority: 'high',
  },
  {
    id: '2',
    type: 'deal',
    title: 'Deal Stage Updated',
    description: 'TechStart Inc moved to Due Diligence stage. All initial documentation has been submitted and approved.',
    dealId: '2',
    dealName: 'TechStart Inc',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    priority: 'medium',
  },
  {
    id: '3',
    type: 'lender',
    title: 'New Lender Response',
    description: 'Capital Bank has submitted initial interest and requested additional financial statements for Q3.',
    dealId: '3',
    dealName: 'GlobalTech Solutions',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    priority: 'medium',
  },
  {
    id: '4',
    type: 'milestone',
    title: 'Milestone Due Tomorrow',
    description: 'Financial documents submission deadline is approaching. Ensure all quarterly reports are finalized.',
    dealId: '1',
    dealName: 'Acme Corp',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    priority: 'high',
  },
  {
    id: '5',
    type: 'alert',
    title: 'Stale Deal Alert',
    description: 'No activity for 14 days on this deal. Consider reaching out to the borrower for an update.',
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
      return <Badge variant="destructive" className="text-xs">High Priority</Badge>;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const scrollToIndex = useCallback((index: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll('[data-card-index]');
    if (cards[index]) {
      const card = cards[index] as HTMLElement;
      const containerWidth = container.offsetWidth;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const scrollPosition = cardCenter - containerWidth / 2;
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    const cards = container.querySelectorAll('[data-card-index]');
    
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    cards.forEach((card, index) => {
      const cardElement = card as HTMLElement;
      const cardCenter = cardElement.offsetLeft + cardElement.offsetWidth / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    setActiveIndex(closestIndex);
  }, []);

  const goToPrevious = () => {
    const newIndex = Math.max(0, activeIndex - 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  };

  const goToNext = () => {
    const newIndex = Math.min(notifications.length - 1, activeIndex + 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      goToPrevious();
    } else if (e.key === 'ArrowRight') {
      goToNext();
    }
  }, [activeIndex, notifications.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    // Center on first card on mount
    setTimeout(() => scrollToIndex(0), 100);
  }, [scrollToIndex]);

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
    <div className="relative py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium text-foreground">Notifications</h3>
          <Badge variant="secondary" className="ml-1">{notifications.length}</Badge>
        </div>
        
        {/* Navigation Arrows */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToNext}
            disabled={activeIndex === notifications.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left Spacer */}
        <div className="flex-shrink-0 w-[calc(50vw-240px)] md:w-[calc(50vw-280px)]" />

        {/* Cards */}
        {notifications.map((notification, index) => {
          const distance = Math.abs(index - activeIndex);
          const isActive = index === activeIndex;
          const IconComponent = getNotificationIcon(notification.type);
          const colorClass = getNotificationColor(notification.type);
          const opacity = isActive ? 1 : Math.max(0.4, 1 - distance * 0.25);

          return (
            <div
              key={notification.id}
              data-card-index={index}
              className="flex-shrink-0 snap-center px-3"
              style={{
                opacity,
                transition: 'opacity 1.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
            >
              <Card
                className={`cursor-pointer transition-all duration-500 ease-out ${
                  isActive
                    ? 'w-[380px] md:w-[480px] min-h-[420px] md:min-h-[480px] shadow-2xl z-10'
                    : 'w-[280px] md:w-[320px] min-h-[320px] md:min-h-[360px] shadow-md'
                }`}
                onClick={() => notification.dealId && navigate(`/deal/${notification.dealId}`)}
              >
                <CardContent className="p-6 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className={`p-3 rounded-xl ${colorClass}`}>
                      <IconComponent className={isActive ? 'h-6 w-6' : 'h-5 w-5'} />
                    </div>
                    {getPriorityBadge(notification.priority)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-3">
                    <h4 className={`font-semibold text-foreground ${isActive ? 'text-xl' : 'text-base'}`}>
                      {notification.title}
                    </h4>
                    <p className={`text-muted-foreground leading-relaxed ${isActive ? 'text-base' : 'text-sm line-clamp-3'}`}>
                      {notification.description}
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      {notification.dealName && (
                        <span className="text-sm text-primary font-medium truncate max-w-[180px]">
                          {notification.dealName}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}

        {/* Right Spacer */}
        <div className="flex-shrink-0 w-[calc(50vw-240px)] md:w-[calc(50vw-280px)]" />
      </div>

      {/* Dot Indicators */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {notifications.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setActiveIndex(index);
              scrollToIndex(index);
            }}
            className={`rounded-full transition-all duration-300 ${
              index === activeIndex
                ? 'w-8 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

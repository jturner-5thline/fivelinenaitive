import { Settings2 } from 'lucide-react';
import { GlobalSearchAI } from '@/components/GlobalSearchAI';

import { HeaderNotificationPreview } from '@/components/notifications/HeaderNotificationPreview';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { CreateDealDialog } from './CreateDealDialog';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';

export function DealsHeader() {
  const location = useLocation();
  const { user } = useAuth();
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const { hasPageAccess } = usePageAccessFlags();


  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative flex h-14 sm:h-16 items-center justify-between pl-3 pr-3 sm:pr-6 gap-2">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-[85px]" />
          </Link>
          <DemoModeBadge />
          <div className="shrink-0">
            <GlobalSearchAI />
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex absolute left-1/2 -translate-x-1/2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={location.pathname === '/deals' 
              ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
              : "text-muted-foreground"
            } 
            asChild
          >
            <Link to="/deals">Deals</Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={location.pathname === '/lenders' 
              ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
              : "text-muted-foreground"
            } 
            asChild
          >
            <Link to="/lenders">Lenders</Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={location.pathname.startsWith('/contacts') 
              ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
              : "text-muted-foreground"
            } 
            asChild
          >
            <Link to="/contacts">Contacts</Link>
          </Button>
          {hasPageAccess('analytics') && (
          <HintTooltip
            hint="View charts, metrics, and performance insights for your deals."
            visible={isHintVisible('analytics-nav')}
            onDismiss={() => dismissHint('analytics-nav')}
            side="bottom"
            align="center"
            showDelay={1500}
          >
            <Button 
              variant="ghost" 
              size="sm" 
              className={location.pathname === '/analytics' 
                ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                : "text-muted-foreground"
              } 
              asChild
            >
              <Link to="/analytics">Analytics</Link>
            </Button>
          </HintTooltip>
          )}
          {hasPageAccess('reports') && user?.email !== 'demo@5thline.co' && (
            <Button 
              variant="ghost" 
              size="sm" 
              className={location.pathname === '/reports' 
                ? "bg-brand-gradient/15 text-foreground border-b-2 border-[hsl(292,46%,15%)] rounded-b-none" 
                : "text-muted-foreground"
              } 
              asChild
            >
              <Link to="/reports">Reports</Link>
            </Button>
          )}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          {!location.pathname.startsWith('/deal/') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.dispatchEvent(new Event('toggle-widgets-edit-mode'))}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Customize widgets</TooltipContent>
            </Tooltip>
          )}
          
          <HintTooltip
            hint="Start here! Click to create your first deal and begin tracking your pipeline."
            visible={isHintVisible('new-deal-button')}
            onDismiss={() => dismissHint('new-deal-button')}
            side="bottom"
            align="end"
          >
            <CreateDealDialog />
          </HintTooltip>
          
        </div>
      </div>
      <HeaderNotificationPreview />
    </header>
  );
}

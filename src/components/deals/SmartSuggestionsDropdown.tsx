import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, Zap, TrendingUp, Clock, Sparkles, ArrowRight, Maximize2, Edit3, LayoutList, GalleryHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Deal } from '@/types/deal';
import { useAllMilestones } from '@/hooks/useAllMilestones';
import { useAllDealsSuggestions, DealSuggestion } from '@/hooks/useAllDealsSuggestions';
import { SuggestionActionDialog } from './SuggestionActionDialog';

interface SmartSuggestionsDropdownProps {
  deals: Deal[];
}

type ViewMode = 'list' | 'carousel';

const priorityConfig = {
  high: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  medium: { color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  low: { color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-muted' },
};

const typeConfig = {
  warning: { icon: Zap, label: 'Follow Up', color: 'text-amber-600' },
  action: { icon: TrendingUp, label: 'Take Action', color: 'text-emerald-600' },
  opportunity: { icon: Sparkles, label: 'Opportunity', color: 'text-primary' },
  reminder: { icon: Clock, label: 'Due Soon', color: 'text-blue-600' },
};

export function SmartSuggestionsDropdown({ deals }: SmartSuggestionsDropdownProps) {
  const navigate = useNavigate();
  const { milestonesMap, refetch: refetchMilestones } = useAllMilestones();
  const { suggestions, counts } = useAllDealsSuggestions(deals, milestonesMap);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<DealSuggestion | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('suggestions-view-mode') as ViewMode) || 'list';
  });
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('suggestions-view-mode', viewMode);
  }, [viewMode]);

  const hasNotifications = counts.total > 0;
  const highPriorityCount = counts.high;

  // Check if suggestion has actionable context (lender or milestone)
  const isActionable = (suggestion: DealSuggestion) => {
    return !!suggestion.lenderId || !!suggestion.milestoneId;
  };

  const handleSuggestionClick = (suggestion: DealSuggestion) => {
    setOpen(false);
    setDialogOpen(false);
    navigate(`/deal/${suggestion.dealId}`);
  };

  const handleActionClick = (suggestion: DealSuggestion, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setDialogOpen(false);
    setSelectedSuggestion(suggestion);
    setActionDialogOpen(true);
  };

  const handleViewAll = () => {
    setOpen(false);
    setDialogOpen(true);
  };

  const handleActionComplete = () => {
    refetchMilestones();
  };

  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, DealSuggestion[]> = {
      warning: [],
      action: [],
      opportunity: [],
      reminder: [],
    };
    suggestions.forEach(s => {
      if (groups[s.type]) {
        groups[s.type].push(s);
      }
    });
    return groups;
  }, [suggestions]);

  const renderSuggestionItem = (suggestion: DealSuggestion, compact = false) => {
    const config = typeConfig[suggestion.type as keyof typeof typeConfig];
    const pConfig = priorityConfig[suggestion.priority];
    const Icon = config.icon;
    const actionable = isActionable(suggestion);

    return (
      <div
        key={suggestion.id}
        onClick={() => handleSuggestionClick(suggestion)}
        className={`flex items-start gap-3 ${compact ? 'py-2.5 px-2' : 'py-3 px-4'} cursor-pointer hover:bg-accent/50 rounded-md group`}
      >
        <div className={`p-1.5 rounded-md ${pConfig.bg} shrink-0 mt-0.5`}>
          <Icon className={`h-3.5 w-3.5 ${pConfig.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">
            {suggestion.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {suggestion.description}
          </p>
          {suggestion.actionLabel && actionable && (
            <Button
              variant="ghost"
              size="sm"
              className={`h-auto p-0 mt-1.5 ${pConfig.color} hover:bg-transparent hover:underline`}
              onClick={(e) => handleActionClick(suggestion, e)}
            >
              <Edit3 className="h-3 w-3 mr-1" />
              {suggestion.actionLabel}
            </Button>
          )}
          {suggestion.actionLabel && !actionable && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium mt-1.5 ${pConfig.color}`}>
              {suggestion.actionLabel}
              <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 relative"
          >
            <Lightbulb className="h-4 w-4" />
            Suggestions
            {hasNotifications && (
              <Badge 
                variant={highPriorityCount > 0 ? "destructive" : "secondary"}
                className="ml-1 h-5 min-w-5 px-1.5 text-xs"
              >
                {counts.total}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 bg-popover">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold">Recommended Actions</span>
            {counts.total > 0 && (
              <Badge variant="outline" className="ml-auto text-xs">
                {counts.total} items
              </Badge>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {counts.total === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">All caught up!</p>
              <p className="text-xs mt-1">No recommendations right now</p>
            </div>
          ) : (
            <>
              <ScrollArea className="h-[280px]">
                <div className="p-1">
                  {Object.entries(groupedSuggestions).map(([type, items]) => {
                    if (items.length === 0) return null;
                    const config = typeConfig[type as keyof typeof typeConfig];
                    const Icon = config.icon;
                    
                    return (
                      <div key={type} className="mb-3">
                        <div className={`px-2 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${config.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {config.label} ({items.length})
                        </div>
                        {items.slice(0, 3).map((suggestion) => {
                          const pConfig = priorityConfig[suggestion.priority];
                          const actionable = isActionable(suggestion);
                          
                          return (
                            <DropdownMenuItem
                              key={suggestion.id}
                              onClick={() => handleSuggestionClick(suggestion)}
                              className="flex items-start gap-3 py-2.5 px-2 cursor-pointer hover:bg-accent/50 rounded-md mx-1"
                            >
                              <div className={`p-1.5 rounded-md ${pConfig.bg} shrink-0 mt-0.5`}>
                                <Icon className={`h-3.5 w-3.5 ${pConfig.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight">
                                  {suggestion.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {suggestion.description}
                                </p>
                                {suggestion.actionLabel && actionable && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-auto p-0 mt-1.5 text-xs ${pConfig.color} hover:bg-transparent hover:underline`}
                                    onClick={(e) => handleActionClick(suggestion, e)}
                                  >
                                    <Edit3 className="h-3 w-3 mr-1" />
                                    {suggestion.actionLabel}
                                  </Button>
                                )}
                                {suggestion.actionLabel && !actionable && (
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium mt-1.5 ${pConfig.color}`}>
                                    {suggestion.actionLabel}
                                    <ArrowRight className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                        {items.length > 3 && (
                          <div className="px-3 py-1.5 text-xs text-muted-foreground">
                            +{items.length - 3} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <DropdownMenuSeparator />
              <div className="p-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full gap-2"
                  onClick={handleViewAll}
                >
                  <Maximize2 className="h-4 w-4" />
                  View All Actions
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (open) setCarouselIndex(0);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                All Recommended Actions
                {counts.total > 0 && (
                  <Badge variant="outline" className="ml-2">
                    {counts.total} items
                  </Badge>
                )}
              </DialogTitle>
              <ToggleGroup 
                type="single" 
                value={viewMode} 
                onValueChange={(val) => val && setViewMode(val as ViewMode)}
                className="bg-muted rounded-md p-0.5"
              >
                <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0 data-[state=on]:bg-background">
                  <LayoutList className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="carousel" aria-label="Carousel view" className="h-7 w-7 p-0 data-[state=on]:bg-background">
                  <GalleryHorizontal className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </DialogHeader>
          
          {viewMode === 'list' ? (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 pb-4">
                {Object.entries(groupedSuggestions).map(([type, items]) => {
                  if (items.length === 0) return null;
                  const config = typeConfig[type as keyof typeof typeConfig];
                  const Icon = config.icon;
                  
                  return (
                    <div key={type}>
                      <div className={`flex items-center gap-2 mb-3 ${config.color}`}>
                        <Icon className="h-4 w-4" />
                        <span className="font-semibold">{config.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {items.length}
                        </Badge>
                      </div>
                      <div className="space-y-1 border rounded-lg bg-card/50">
                        {items.map((suggestion) => renderSuggestionItem(suggestion))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Carousel Navigation */}
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
                  disabled={carouselIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {carouselIndex + 1} of {suggestions.length}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCarouselIndex(Math.min(suggestions.length - 1, carouselIndex + 1))}
                  disabled={carouselIndex >= suggestions.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Carousel Content */}
              <div 
                ref={carouselRef}
                className="flex-1 overflow-hidden relative"
              >
                <div 
                  className="flex transition-transform duration-300 ease-out h-full"
                  style={{ transform: `translateX(-${carouselIndex * 100}%)` }}
                >
                  {suggestions.map((suggestion) => {
                    const config = typeConfig[suggestion.type as keyof typeof typeConfig];
                    const pConfig = priorityConfig[suggestion.priority];
                    const Icon = config.icon;
                    const actionable = isActionable(suggestion);
                    
                    return (
                      <div
                        key={suggestion.id}
                        className="w-full flex-shrink-0 px-2"
                      >
                        <div 
                          className={`h-full border rounded-xl p-6 bg-card/50 ${pConfig.border} cursor-pointer hover:shadow-md transition-shadow`}
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-lg ${pConfig.bg}`}>
                              <Icon className={`h-6 w-6 ${pConfig.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium mb-1 ${config.color}`}>
                                {config.label}
                              </div>
                              <h3 className="text-lg font-semibold mb-2">
                                {suggestion.title}
                              </h3>
                              <p className="text-sm text-muted-foreground mb-4">
                                {suggestion.description}
                              </p>
                              {suggestion.actionLabel && actionable && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="gap-2"
                                  onClick={(e) => handleActionClick(suggestion, e)}
                                >
                                  <Edit3 className="h-4 w-4" />
                                  {suggestion.actionLabel}
                                </Button>
                              )}
                              {suggestion.actionLabel && !actionable && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => handleSuggestionClick(suggestion)}
                                >
                                  {suggestion.actionLabel}
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Dot Indicators */}
              <div className="flex justify-center gap-1.5 mt-4 pt-2 border-t">
                {suggestions.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCarouselIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === carouselIndex 
                        ? 'bg-primary' 
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SuggestionActionDialog
        suggestion={selectedSuggestion}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onComplete={handleActionComplete}
      />
    </>
  );
}
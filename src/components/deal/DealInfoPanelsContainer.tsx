import { ReactNode, useMemo } from 'react';
import { Search, MessageSquare, Clock, AlertCircle, ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DealPanelId } from '@/hooks/useDealPanelOrder';

interface DealInfoPanelsContainerProps {
  panelOrder: DealPanelId[];
  onOpenReorderDialog: () => void;
  // AI Research Panel
  isResearchPanelOpen: boolean;
  onResearchPanelOpenChange: (open: boolean) => void;
  researchPanelContent: ReactNode;
  // AI Assistant Panel
  isAssistantPanelOpen: boolean;
  onAssistantPanelOpenChange: (open: boolean) => void;
  assistantPanelContent: ReactNode;
  // AI Activity Summary Panel
  isActivitySummaryOpen: boolean;
  onActivitySummaryOpenChange: (open: boolean) => void;
  activitySummaryContent: ReactNode;
  // AI Suggestions Panel
  isSuggestionsPanelOpen: boolean;
  onSuggestionsPanelOpenChange: (open: boolean) => void;
  suggestionsPanelContent: ReactNode;
  // Deal Information Panel
  dealInformationContent: ReactNode;
  // Outstanding Items Panel
  outstandingItemsContent: ReactNode;
  // Status History (rendered separately, not reorderable)
  statusHistoryContent?: ReactNode;
}

const PANEL_CONFIG: Record<DealPanelId, { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>;
  isCollapsible: boolean;
}> = {
  'ai-research': { label: 'AI Research', icon: Search, isCollapsible: true },
  'ai-assistant': { label: 'AI Deal Assistant', icon: MessageSquare, isCollapsible: true },
  'ai-activity-summary': { label: 'AI Activity Summary', icon: Clock, isCollapsible: true },
  'ai-suggestions': { label: 'AI Smart Suggestions', icon: AlertCircle, isCollapsible: true },
  'deal-information': { label: 'Deal Information', icon: Search, isCollapsible: false },
  'outstanding-items': { label: 'Outstanding Items', icon: Search, isCollapsible: false },
};

export function DealInfoPanelsContainer({
  panelOrder,
  onOpenReorderDialog,
  isResearchPanelOpen,
  onResearchPanelOpenChange,
  researchPanelContent,
  isAssistantPanelOpen,
  onAssistantPanelOpenChange,
  assistantPanelContent,
  isActivitySummaryOpen,
  onActivitySummaryOpenChange,
  activitySummaryContent,
  isSuggestionsPanelOpen,
  onSuggestionsPanelOpenChange,
  suggestionsPanelContent,
  dealInformationContent,
  outstandingItemsContent,
  statusHistoryContent,
}: DealInfoPanelsContainerProps) {
  // Map panel IDs to their render functions
  const panelRenderers: Record<DealPanelId, () => ReactNode> = useMemo(() => ({
    'ai-research': () => (
      <Collapsible open={isResearchPanelOpen} onOpenChange={onResearchPanelOpenChange} className="h-full">
        <Card className="h-full flex flex-col">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  AI Research
                </CardTitle>
                {isResearchPanelOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="pt-0 flex-1">
              {researchPanelContent}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    ),
    'ai-assistant': () => (
      <Collapsible open={isAssistantPanelOpen} onOpenChange={onAssistantPanelOpenChange} className="h-full">
        <Card className="h-full flex flex-col">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  AI Deal Assistant
                </CardTitle>
                {isAssistantPanelOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="pt-0 flex-1">
              {assistantPanelContent}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    ),
    'ai-activity-summary': () => (
      <Collapsible open={isActivitySummaryOpen} onOpenChange={onActivitySummaryOpenChange} className="h-full">
        <Card className="h-full flex flex-col">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  AI Activity Summary
                </CardTitle>
                {isActivitySummaryOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="pt-0 flex-1">
              {activitySummaryContent}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    ),
    'ai-suggestions': () => (
      <Collapsible open={isSuggestionsPanelOpen} onOpenChange={onSuggestionsPanelOpenChange} className="h-full">
        <Card className="h-full flex flex-col">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  AI Smart Suggestions
                </CardTitle>
                {isSuggestionsPanelOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="pt-0 flex-1">
              {suggestionsPanelContent}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    ),
    'deal-information': () => dealInformationContent,
    'outstanding-items': () => outstandingItemsContent,
  }), [
    isResearchPanelOpen, onResearchPanelOpenChange, researchPanelContent,
    isAssistantPanelOpen, onAssistantPanelOpenChange, assistantPanelContent,
    isActivitySummaryOpen, onActivitySummaryOpenChange, activitySummaryContent,
    isSuggestionsPanelOpen, onSuggestionsPanelOpenChange, suggestionsPanelContent,
    dealInformationContent, outstandingItemsContent,
  ]);

  // Group panels into rows of 2
  const panelRows = useMemo(() => {
    const rows: DealPanelId[][] = [];
    for (let i = 0; i < panelOrder.length; i += 2) {
      rows.push(panelOrder.slice(i, i + 2));
    }
    return rows;
  }, [panelOrder]);

  return (
    <div className="space-y-6">
      {/* Reorder Button */}
      <div className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-2 text-muted-foreground"
                onClick={onOpenReorderDialog}
              >
                <Settings2 className="h-4 w-4" />
                Customize Layout
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reorder panels in this tab</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Status History (always at top, not reorderable) */}
      {statusHistoryContent}

      {/* Render panels in order, grouped by rows of 2 */}
      {panelRows.map((row, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {row.map((panelId) => (
            <div key={panelId} className="h-full">
              {panelRenderers[panelId]()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

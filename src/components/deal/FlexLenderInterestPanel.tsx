import { useState } from "react";
import { 
  Flame, 
  Thermometer, 
  Snowflake, 
  Eye, 
  Download, 
  HelpCircle, 
  Bookmark, 
  FileSignature, 
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFlexLenderEngagement, LenderEngagement } from "@/hooks/useFlexLenderEngagement";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface FlexLenderInterestPanelProps {
  dealId: string | undefined;
}

function EngagementBadge({ level }: { level: "hot" | "warm" | "cold" }) {
  const config = {
    hot: {
      icon: Flame,
      label: "Hot",
      className: "bg-red-500/10 text-red-600 border-red-500/20",
    },
    warm: {
      icon: Thermometer,
      label: "Warm",
      className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    },
    cold: {
      icon: Snowflake,
      label: "Cold",
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    },
  };

  const { icon: Icon, label, className } = config[level];

  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function MetricPill({ 
  icon: Icon, 
  value, 
  label,
  highlight = false 
}: { 
  icon: typeof Eye; 
  value: number; 
  label: string;
  highlight?: boolean;
}) {
  if (value === 0) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
            highlight 
              ? "bg-green-500/10 text-green-600" 
              : "bg-muted text-muted-foreground"
          )}>
            <Icon className="h-3 w-3" />
            <span className="font-medium">{value}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{value} {label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LenderCard({ lender }: { lender: LenderEngagement }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn(
        "border rounded-lg p-3 transition-colors",
        lender.engagementLevel === "hot" && "border-red-500/30 bg-red-500/5",
        lender.engagementLevel === "warm" && "border-amber-500/30 bg-amber-500/5",
        lender.engagementLevel === "cold" && "border-border"
      )}>
        <CollapsibleTrigger asChild>
          <div className="flex items-start justify-between cursor-pointer group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm truncate">
                  {lender.lenderName}
                </h4>
                <EngagementBadge level={lender.engagementLevel} />
              </div>
              {lender.lenderEmail && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {lender.lenderEmail}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Last active {formatDistanceToNow(new Date(lender.lastActivity), { addSuffix: true })}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CollapsibleTrigger>
        
        {/* Quick metrics */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <MetricPill icon={FileSignature} value={lender.termSheetRequests} label="Term Sheet Requests" highlight />
          <MetricPill icon={FileText} value={lender.ndaRequests} label="NDA Requests" highlight />
          <MetricPill icon={HelpCircle} value={lender.infoRequests} label="Info Requests" highlight />
          <MetricPill icon={Download} value={lender.downloads} label="Downloads" />
          <MetricPill icon={Bookmark} value={lender.saves} label="Saves" />
          <MetricPill icon={Eye} value={lender.views} label="Views" />
        </div>

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t space-y-2">
            {/* Engagement score */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Engagement Score</span>
              <span className="font-semibold">{lender.engagementScore}</span>
            </div>
            
            {/* Total actions */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Actions</span>
              <span className="font-medium">{lender.totalActions}</span>
            </div>

            {/* Downloaded files */}
            {lender.downloadedFiles.length > 0 && (
              <div className="text-xs">
                <p className="text-muted-foreground mb-1">Downloaded Files:</p>
                <div className="flex flex-wrap gap-1">
                  {lender.downloadedFiles.slice(0, 5).map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                      {file}
                    </Badge>
                  ))}
                  {lender.downloadedFiles.length > 5 && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      +{lender.downloadedFiles.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function FlexLenderInterestPanel({ dealId }: FlexLenderInterestPanelProps) {
  const { data: lenders, isLoading, error } = useFlexLenderEngagement(dealId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Lender Interest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-3">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-48 mb-2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Lender Interest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load lender interest data</p>
        </CardContent>
      </Card>
    );
  }

  const hotLenders = lenders?.filter(l => l.engagementLevel === "hot") || [];
  const warmLenders = lenders?.filter(l => l.engagementLevel === "warm") || [];
  const coldLenders = lenders?.filter(l => l.engagementLevel === "cold") || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Lender Interest
            <Badge variant="secondary" className="ml-1 text-xs">
              {lenders?.length || 0}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span>via FLEx</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(!lenders || lenders.length === 0) ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No lender activity from FLEx yet</p>
            <p className="text-xs mt-1">Activity will appear here when lenders engage with your deal on FLEx</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-500/10 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-red-600">
                  <Flame className="h-3.5 w-3.5" />
                  <span className="text-lg font-bold">{hotLenders.length}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Hot</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-amber-600">
                  <Thermometer className="h-3.5 w-3.5" />
                  <span className="text-lg font-bold">{warmLenders.length}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Warm</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-blue-600">
                  <Snowflake className="h-3.5 w-3.5" />
                  <span className="text-lg font-bold">{coldLenders.length}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Cold</p>
              </div>
            </div>

            {/* Lender list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {lenders.map((lender, index) => (
                <LenderCard key={`${lender.lenderName}-${index}`} lender={lender} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

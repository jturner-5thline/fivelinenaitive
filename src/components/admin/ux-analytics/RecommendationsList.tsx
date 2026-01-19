import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { UXRecommendation } from "@/hooks/useUXAnalytics";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface RecommendationsListProps {
  recommendations: UXRecommendation[];
}

export function RecommendationsList({ recommendations }: RecommendationsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const getPriorityColor = (priority: UXRecommendation["priority"]) => {
    switch (priority) {
      case "critical":
        return "bg-red-500 hover:bg-red-600";
      case "high":
        return "bg-orange-500 hover:bg-orange-600";
      case "medium":
        return "bg-yellow-500 hover:bg-yellow-600 text-black";
      case "low":
        return "bg-blue-500 hover:bg-blue-600";
    }
  };

  const getCategoryColor = (category: UXRecommendation["category"]) => {
    switch (category) {
      case "engagement":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "conversion":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "usability":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "bugs":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "design":
        return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
      case "retention":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
    }
  };

  const handleCopyPrompt = async (id: string, prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    toast({ title: "Prompt copied!", description: "Paste it into Lovable to implement the fix." });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const calculateProgress = (current: number, target: number) => {
    if (target === 0) return current === 0 ? 100 : 0;
    // For metrics where lower is better (like errors, bounce rate)
    if (target < current) {
      return Math.max(0, Math.min(100, ((current - target) / current) * 100));
    }
    return Math.max(0, Math.min(100, (current / target) * 100));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Recommendations</h3>
      {recommendations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No recommendations at this time. Your UX is looking great!
          </CardContent>
        </Card>
      ) : (
        recommendations.map((rec) => (
          <Collapsible
            key={rec.id}
            open={expandedId === rec.id}
            onOpenChange={(open) => setExpandedId(open ? rec.id : null)}
          >
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn("text-white", getPriorityColor(rec.priority))}>
                      {rec.priority}
                    </Badge>
                    <Badge variant="outline" className={getCategoryColor(rec.category)}>
                      {rec.category}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyPrompt(rec.id, rec.prompt);
                    }}
                  >
                    {copiedId === rec.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <CardTitle className="text-base mt-2">{rec.title}</CardTitle>
                <CardDescription>{rec.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{rec.reasoning}</p>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Current: {rec.current_value.toFixed(1)}</span>
                    <span>Target: {rec.target_value.toFixed(1)}</span>
                  </div>
                  <Progress value={calculateProgress(rec.current_value, rec.target_value)} className="h-2" />
                </div>

                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full">
                    {expandedId === rec.id ? (
                      <>
                        <ChevronUp className="mr-2 h-4 w-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Show Action Items
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-2">Action Items</p>
                    <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                      {rec.action_items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm font-medium">Expected Impact</p>
                    <p className="text-sm text-muted-foreground">{rec.impact}</p>
                  </div>
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        ))
      )}
    </div>
  );
}

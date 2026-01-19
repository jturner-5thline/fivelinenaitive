import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, Copy, Check } from "lucide-react";
import { UXInsight } from "@/hooks/useUXAnalytics";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface InsightsGridProps {
  insights: UXInsight[];
}

export function InsightsGrid({ insights }: InsightsGridProps) {
  const [selectedInsight, setSelectedInsight] = useState<UXInsight | null>(null);
  const [copied, setCopied] = useState(false);

  const getTrendIcon = (trend: "up" | "down" | "neutral") => {
    switch (trend) {
      case "up":
        return <ArrowUp className="h-4 w-4 text-green-500" />;
      case "down":
        return <ArrowDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getCategoryColor = (category: "positive" | "negative" | "neutral") => {
    switch (category) {
      case "positive":
        return "border-green-500/50 bg-green-500/5";
      case "negative":
        return "border-red-500/50 bg-red-500/5";
      default:
        return "border-muted";
    }
  };

  const handleCopyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast({ title: "Prompt copied!", description: "Paste it into Lovable to implement the fix." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => (
          <Card
            key={insight.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              getCategoryColor(insight.category)
            )}
            onClick={() => setSelectedInsight(insight)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{insight.title}</CardTitle>
                {getTrendIcon(insight.trend)}
              </div>
              <CardDescription>{insight.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{insight.metric_value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedInsight} onOpenChange={() => setSelectedInsight(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedInsight?.title}
              {selectedInsight && getTrendIcon(selectedInsight.trend)}
            </DialogTitle>
            <DialogDescription>{selectedInsight?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Details</p>
              <p className="text-sm">{selectedInsight?.details}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Recommendations</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {selectedInsight?.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
            <Button
              onClick={() => selectedInsight && handleCopyPrompt(selectedInsight.prompt)}
              className="w-full"
              variant="outline"
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Lovable Prompt
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

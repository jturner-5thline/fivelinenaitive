import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HealthScoreCardProps {
  score: number;
  totalRecommendations: number;
}

export function HealthScoreCard({ score, totalRecommendations }: HealthScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return "stroke-green-500";
    if (score >= 40) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">UX Health Score</CardTitle>
        <CardDescription>Overall user experience quality</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center gap-8">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-muted/20"
            />
            <circle
              cx="64"
              cy="64"
              r="45"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={cn("transition-all duration-1000", getScoreBgColor(score))}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={cn("text-3xl font-bold", getScoreColor(score))}>{score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold">{totalRecommendations}</p>
          <p className="text-sm text-muted-foreground">Recommendations</p>
        </div>
      </CardContent>
    </Card>
  );
}

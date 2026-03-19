import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ComingSoonPlaceholderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export function ComingSoonPlaceholder({ icon: Icon, title, description }: ComingSoonPlaceholderProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted/50 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}

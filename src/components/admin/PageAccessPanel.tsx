import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LayoutDashboard, 
  Newspaper, 
  BarChart3, 
  Lightbulb, 
  Users, 
  UserCog, 
  Cog, 
  Plug,
  Workflow,
  FlaskConical,
  Rocket,
  Ban,
  Bot
} from "lucide-react";
import { toast } from "sonner";
import {
  useFeatureFlags,
  useUpdateFeatureFlag,
  useCreateFeatureFlag,
  FeatureStatus,
} from "@/hooks/useFeatureFlags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PageConfig {
  featureKey: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const pageConfigs: PageConfig[] = [
  { 
    featureKey: "page_dashboard", 
    label: "Dashboard", 
    description: "Main dashboard with deal overview and widgets",
    icon: <LayoutDashboard className="h-5 w-5" />
  },
  { 
    featureKey: "page_newsfeed", 
    label: "News Feed", 
    description: "Industry news and lender updates",
    icon: <Newspaper className="h-5 w-5" />
  },
  { 
    featureKey: "page_metrics", 
    label: "Metrics", 
    description: "Analytics and performance metrics",
    icon: <BarChart3 className="h-5 w-5" />
  },
  { 
    featureKey: "page_insights", 
    label: "Insights", 
    description: "AI-powered deal insights and recommendations",
    icon: <Lightbulb className="h-5 w-5" />
  },
  { 
    featureKey: "page_sales_bd", 
    label: "Sales & BD", 
    description: "Sales and business development tools",
    icon: <Users className="h-5 w-5" />
  },
  { 
    featureKey: "page_hr", 
    label: "HR", 
    description: "Human resources management",
    icon: <UserCog className="h-5 w-5" />
  },
  { 
    featureKey: "page_operations", 
    label: "Operations", 
    description: "Operations management and workflows",
    icon: <Cog className="h-5 w-5" />
  },
  { 
    featureKey: "page_integrations", 
    label: "Integrations", 
    description: "Third-party integrations and connections",
    icon: <Plug className="h-5 w-5" />
  },
  { 
    featureKey: "page_workflows", 
    label: "Workflows", 
    description: "Automation workflows and scheduled actions",
    icon: <Workflow className="h-5 w-5" />
  },
  { 
    featureKey: "page_agents", 
    label: "AI Agents", 
    description: "AI-powered automation agents and assistants",
    icon: <Bot className="h-5 w-5" />
  },
  { 
    featureKey: "chat_widget", 
    label: "AI Chat Widget", 
    description: "AI search and chat assistant widget",
    icon: <Bot className="h-5 w-5" />
  },
];

const statusConfig: Record<
  FeatureStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  deployed: {
    label: "All Users",
    variant: "default",
    icon: <Rocket className="h-3 w-3" />,
  },
  staging: {
    label: "5thLine Only",
    variant: "secondary",
    icon: <FlaskConical className="h-3 w-3" />,
  },
  disabled: {
    label: "Disabled",
    variant: "outline",
    icon: <Ban className="h-3 w-3" />,
  },
};

export function PageAccessPanel() {
  const { data: flags, isLoading } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const createFlag = useCreateFeatureFlag();

  const getPageFlag = (featureKey: string) => {
    return flags?.find(f => f.name === featureKey);
  };

  const handleStatusChange = async (featureKey: string, status: FeatureStatus) => {
    const flag = getPageFlag(featureKey);
    
    try {
      if (!flag) {
        // Create the flag if it doesn't exist
        await createFlag.mutateAsync({ 
          name: featureKey, 
          description: `Access control for ${featureKey.replace(/_/g, ' ')}`,
          status 
        });
        const statusLabel = status === 'staging' ? '5thLine only' : status === 'deployed' ? 'all users' : 'disabled';
        toast.success(`${featureKey.replace('page_', '').replace(/_/g, ' ')} access set to ${statusLabel}`);
        return;
      }

      await updateFlag.mutateAsync({ id: flag.id, status });
      const statusLabel = status === 'staging' ? '5thLine only' : status === 'deployed' ? 'all users' : 'disabled';
      toast.success(`${featureKey.replace('page_', '').replace(/_/g, ' ')} access set to ${statusLabel}`);
    } catch (error) {
      toast.error("Failed to update page access");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <h4 className="font-medium text-sm">Access Levels</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="gap-1">
              <Rocket className="h-3 w-3" />
              All Users
            </Badge>
            <span className="text-muted-foreground">Visible to everyone</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <FlaskConical className="h-3 w-3" />
              5thLine Only
            </Badge>
            <span className="text-muted-foreground">Staging - internal only</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Ban className="h-3 w-3" />
              Disabled
            </Badge>
            <span className="text-muted-foreground">Hidden from everyone</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {pageConfigs.map((config) => {
          const flag = getPageFlag(config.featureKey);
          const status = (flag?.status || 'deployed') as FeatureStatus;
          const statusInfo = statusConfig[status];

          return (
            <Card key={config.featureKey}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {config.icon}
                  </div>
                  <div>
                    <h4 className="font-medium">{config.label}</h4>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                  </div>
                </div>
                
                <Select
                  value={status}
                  onValueChange={(value: FeatureStatus) => handleStatusChange(config.featureKey, value)}
                  disabled={updateFlag.isPending || createFlag.isPending}
                >
                  <SelectTrigger className="w-[180px]">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusInfo.variant} className="gap-1">
                        {statusInfo.icon}
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deployed">
                      <div className="flex items-center gap-2">
                        <Rocket className="h-3 w-3" />
                        All Users
                      </div>
                    </SelectItem>
                    <SelectItem value="staging">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-3 w-3" />
                        5thLine Only (Staging)
                      </div>
                    </SelectItem>
                    <SelectItem value="disabled">
                      <div className="flex items-center gap-2">
                        <Ban className="h-3 w-3" />
                        Disabled
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

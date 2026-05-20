import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  User,
  Rocket,
  Ban,
  Bot,
  DollarSign,
  Activity,
  Briefcase,
  Building2,
  Send,
  FileSignature,
  Video,
  Search,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
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
    featureKey: "page_finance", 
    label: "Finance", 
    description: "Financial management and reporting",
    icon: <DollarSign className="h-5 w-5" />
  },
  { 
    featureKey: "page_ai_research", 
    label: "AI Research", 
    description: "AI-powered research and analysis tools",
    icon: <Sparkles className="h-5 w-5" />
  },
  { 
    featureKey: "page_video_library", 
    label: "Video Library", 
    description: "Walkthrough videos and learning resources",
    icon: <Video className="h-5 w-5" />
  },
  { 
    featureKey: "chat_widget", 
    label: "AI Chat Widget", 
    description: "AI search and chat assistant widget",
    icon: <Bot className="h-5 w-5" />
  },
  { 
    featureKey: "copilot_widget", 
    label: "naitive AI", 
    description: "Floating AI copilot drawer accessible from every page",
    icon: <Sparkles className="h-5 w-5" />
  },
  { 
    featureKey: "deal_pulse_widgets", 
    label: "Deal Pulse Widgets", 
    description: "Health score, days in stage, lender count, response rate, milestones & data room metrics row",
    icon: <Activity className="h-5 w-5" />
  },
  { 
    featureKey: "page_deal_detail", 
    label: "Deal Detail Page", 
    description: "Individual deal detail view with all deal information",
    icon: <Briefcase className="h-5 w-5" />
  },
  { 
    featureKey: "page_deal_space", 
    label: "Deal Space", 
    description: "AI-powered deal workspace with notes, financials, and documents",
    icon: <Sparkles className="h-5 w-5" />
  },
  { 
    featureKey: "page_deal_management", 
    label: "Deal Management Tab", 
    description: "Management tab in deal detail with tasks, info requests, and activity",
    icon: <Cog className="h-5 w-5" />
  },
  { 
    featureKey: "page_lenders", 
    label: "Directory", 
    description: "Master lender directory and management",
    icon: <Building2 className="h-5 w-5" />
  },
  { 
    featureKey: "page_analytics", 
    label: "Analytics", 
    description: "Charts, metrics, and performance insights",
    icon: <BarChart3 className="h-5 w-5" />
  },
  { 
    featureKey: "page_reports", 
    label: "Reports", 
    description: "Custom and scheduled reporting",
    icon: <FileSignature className="h-5 w-5" />
  },
  { 
    featureKey: "lender_matching", 
    label: "Lender Matching", 
    description: "AI-powered lender suggestions and matching algorithm in deal detail",
    icon: <Sparkles className="h-5 w-5" />
  },
  { 
    featureKey: "flex_push", 
    label: "Push to FLEx", 
    description: "Ability to publish/unpublish deals and data rooms to FLEx",
    icon: <Send className="h-5 w-5" />
  },
  { 
    featureKey: "autofill_deal_space", 
    label: "Auto-Fill from Deal Space", 
    description: "AI extraction of write-up fields from Deal Space documents",
    icon: <Sparkles className="h-5 w-5" />
  },
  { 
    featureKey: "generate_ai_memo", 
    label: "Generate AI Memo", 
    description: "AI-generated lender-ready memo from deal data",
    icon: <FileSignature className="h-5 w-5" />
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
  james_only: {
    label: "James Only",
    variant: "destructive",
    icon: <User className="h-3 w-3" />,
  },
  disabled: {
    label: "Disabled",
    variant: "outline",
    icon: <Ban className="h-3 w-3" />,
  },
};

type SortOption = "name_asc" | "name_desc" | "status";
type FilterOption = "all" | FeatureStatus;

export function PageAccessPanel() {
  const { data: flags, isLoading } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const createFlag = useCreateFeatureFlag();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");

  const getPageFlag = (featureKey: string) => {
    return flags?.find(f => f.name === featureKey);
  };

  const getStatus = (featureKey: string): FeatureStatus => {
    const flag = getPageFlag(featureKey);
    return (flag?.status || 'deployed') as FeatureStatus;
  };

  const filteredAndSorted = useMemo(() => {
    let result = pageConfigs.filter((config) => {
      const matchesSearch =
        !searchQuery ||
        config.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        config.description.toLowerCase().includes(searchQuery.toLowerCase());
      const status = getStatus(config.featureKey);
      const matchesFilter = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesFilter;
    });

    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.label.localeCompare(b.label);
      if (sortBy === "name_desc") return b.label.localeCompare(a.label);
      // sort by status priority: deployed > staging > james_only > disabled
      const order: Record<FeatureStatus, number> = { deployed: 0, staging: 1, james_only: 2, disabled: 3 };
      return order[getStatus(a.featureKey)] - order[getStatus(b.featureKey)];
    });

    return result;
  }, [searchQuery, statusFilter, sortBy, flags]);

  // Count per status for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: pageConfigs.length, deployed: 0, staging: 0, james_only: 0, disabled: 0 };
    for (const config of pageConfigs) {
      const s = getStatus(config.featureKey);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [flags]);

  const handleStatusChange = async (featureKey: string, status: FeatureStatus) => {
    const flag = getPageFlag(featureKey);
    
    try {
      if (!flag) {
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

  const handleBetaToggle = async (featureKey: string, isBeta: boolean) => {
    const flag = getPageFlag(featureKey);
    
    try {
      if (!flag) {
        await createFlag.mutateAsync({ 
          name: featureKey, 
          description: `Access control for ${featureKey.replace(/_/g, ' ')}`,
          status: 'deployed'
        });
        const { data } = await supabase
          .from("feature_flags")
          .select("id")
          .eq("name", featureKey)
          .single();
        if (data) {
          await updateFlag.mutateAsync({ id: data.id, is_beta: isBeta });
        }
      } else {
        await updateFlag.mutateAsync({ id: flag.id, is_beta: isBeta });
      }
      const label = featureKey.replace('page_', '').replace(/_/g, ' ');
      toast.success(`${label} ${isBeta ? 'marked as beta' : 'beta tag removed'}`);
    } catch (error) {
      toast.error("Failed to update beta status");
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
      {/* Toolbar: Search, Filter, Sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterOption)}>
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {statusFilter === "all"
                  ? `All (${statusCounts.all})`
                  : `${statusConfig[statusFilter].label} (${statusCounts[statusFilter] || 0})`}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({statusCounts.all})</SelectItem>
            <SelectItem value="deployed">
              <div className="flex items-center gap-2">
                <Rocket className="h-3 w-3" /> All Users ({statusCounts.deployed})
              </div>
            </SelectItem>
            <SelectItem value="staging">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-3 w-3" /> 5thLine Only ({statusCounts.staging})
              </div>
            </SelectItem>
            <SelectItem value="james_only">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3" /> James Only ({statusCounts.james_only})
              </div>
            </SelectItem>
            <SelectItem value="disabled">
              <div className="flex items-center gap-2">
                <Ban className="h-3 w-3" /> Disabled ({statusCounts.disabled})
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{sortBy === "name_asc" ? "Name A–Z" : sortBy === "name_desc" ? "Name Z–A" : "By Access Level"}</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="name_desc">Name Z–A</SelectItem>
            <SelectItem value="status">By Access Level</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Access Level Legend */}
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
            <Badge variant="destructive" className="gap-1">
              <User className="h-3 w-3" />
              James Only
            </Badge>
            <span className="text-muted-foreground">Only jturner@5thline.co</span>
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

      {/* Results count */}
      {(searchQuery || statusFilter !== "all") && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredAndSorted.length} of {pageConfigs.length} features
        </p>
      )}

      <div className="grid gap-4">
        {filteredAndSorted.map((config) => {
          const flag = getPageFlag(config.featureKey);
          const status = (flag?.status || 'deployed') as FeatureStatus;
          const statusInfo = statusConfig[status];
          const isBeta = flag?.is_beta ?? false;

          return (
            <Card key={config.featureKey}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {config.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{config.label}</h4>
                      {isBeta && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-warning text-warning font-semibold">
                          Beta
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Beta</span>
                    <Switch
                      checked={isBeta}
                      onCheckedChange={(checked) => handleBetaToggle(config.featureKey, checked)}
                      disabled={updateFlag.isPending || createFlag.isPending}
                      className="scale-75"
                    />
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
                      <SelectItem value="james_only">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          James Only
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
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredAndSorted.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No features match your search or filter.
          </div>
        )}
      </div>
    </div>
  );
}
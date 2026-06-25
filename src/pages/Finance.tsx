import { AppLayout } from "@/components/AppLayout";
import { FPAWorkspace } from "@/components/fpa/FPAWorkspace";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, BarChart3, Database, FileSpreadsheet, Sparkles, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTION_LINKS = [
  { key: "dashboards", label: "Dashboards", icon: BarChart3 },
  { key: "data", label: "Data", icon: Database },
  { key: "sheets", label: "Sheets", icon: FileSpreadsheet },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "automations", label: "Automations", icon: Zap },
] as const;

function FinanceHeader() {
  const [active, setActive] = useState<string>(() =>
    (typeof window !== "undefined" && window.location.hash.replace("#", "")) || "dashboards"
  );

  useEffect(() => {
    const onHash = () => setActive(window.location.hash.replace("#", "") || "dashboards");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (key: string) => {
    window.location.hash = key;
    setActive(key);
  };

  const activeLink = SECTION_LINKS.find((s) => s.key === active) ?? SECTION_LINKS[0];
  const ActiveIcon = activeLink.icon;

  return (
    <div className="flex items-center gap-4 flex-nowrap min-w-0">
      <h1 className="text-[21px] font-semibold leading-none text-foreground shrink-0">
        Finance
      </h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" aria-label="Finance section">
            <ActiveIcon className="h-3.5 w-3.5" />
            {activeLink.label}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {SECTION_LINKS.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.key;
            return (
              <DropdownMenuItem
                key={s.key}
                onSelect={() => go(s.key)}
                className={cn("gap-2 text-xs", isActive && "text-primary")}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1">{s.label}</span>
                {isActive && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Portal target — DashboardModule renders Cash Flow / Sales & BD ROI / Sales Model tabs here */}
      <div
        id="finance-header-tabs"
        className="flex items-center gap-1 flex-nowrap shrink-0"
      />
      {/* Portal target — DashboardModule renders Charts/Export/Team Config/Views here */}
      <div
        id="finance-header-actions"
        className="ml-auto flex items-center gap-2 flex-nowrap shrink-0"
      />
    </div>
  );
}

export default function Finance() {
  const { company, isLoading: companyLoading } = useCompany();

  if (companyLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!company) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Company Found</h2>
              <p className="text-muted-foreground text-center">
                You need to be part of a company to access the FP&A workspace.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <DashboardPage
        padding="md"
        container={false}
        bodySpacing="space-y-4"
        headerClassName="!bg-transparent !backdrop-blur-none !border-b-0 !py-2"
        header={<FinanceHeader />}
      >
        <FPAWorkspace />
      </DashboardPage>
    </AppLayout>
  );
}

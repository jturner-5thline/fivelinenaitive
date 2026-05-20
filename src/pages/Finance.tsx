import { AppLayout } from "@/components/AppLayout";
import { FPAWorkspace } from "@/components/fpa/FPAWorkspace";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, BarChart3, Database, FileSpreadsheet, Sparkles, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-2xl font-bold leading-none">Finance</h1>
      <nav className="flex items-center gap-1 flex-wrap ml-auto" aria-label="Finance sections">
        {SECTION_LINKS.map((s) => {
          const isActive = active === s.key;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => go(s.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
      </nav>
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

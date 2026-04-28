import { AppLayout } from "@/components/AppLayout";
import { FPAWorkspace } from "@/components/fpa/FPAWorkspace";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "@/components/layout/DashboardPage";

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
        header={
          <div>
            <h1 className="text-2xl font-bold">Finance</h1>
          </div>
        }
      >
        <FPAWorkspace />
      </DashboardPage>
    </AppLayout>
  );
}

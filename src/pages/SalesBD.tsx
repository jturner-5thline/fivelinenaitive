import { Helmet } from "react-helmet-async";
import { Users, Mail, Handshake } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const EmailDesigner = lazy(() => import("./EmailDesigner"));
const PartnersPipeline = lazy(() => import("./PartnersPipeline"));

export default function SalesBD() {
  return (
    <>
      <Helmet>
        <title>Sales & BD | 5thLine</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-8 px-4">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Sales & BD</h1>
            <p className="text-muted-foreground mt-1">
              Manage your sales pipeline and business development activities
            </p>
          </div>

          <Tabs defaultValue="email-designer">
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="email-designer" className="gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email Designer
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      Sales tracking and BD tools will be available here.
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Sales & Business Development</h3>
                <p className="text-muted-foreground max-w-md mt-2">
                  This page will help you manage outreach campaigns, track prospective clients,
                  monitor referral partnerships, and analyze your sales funnel performance.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="email-designer">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <EmailDesigner />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

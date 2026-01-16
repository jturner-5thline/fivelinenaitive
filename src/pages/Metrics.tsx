import { Helmet } from "react-helmet-async";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Metrics() {
  return (
    <>
      <Helmet>
        <title>Metrics | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Metrics</h1>
          <p className="text-muted-foreground mt-1">
            Track your key performance indicators and metrics
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>
                Detailed metrics and KPI tracking will be available here.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Metrics Dashboard</h3>
          <p className="text-muted-foreground max-w-md mt-2">
            This page will display comprehensive metrics including deal velocity, conversion rates, 
            lender engagement scores, and pipeline health indicators.
          </p>
        </div>
      </div>
    </>
  );
}

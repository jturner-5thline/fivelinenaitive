import { Helmet } from "react-helmet-async";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Insights() {
  return (
    <>
      <Helmet>
        <title>Insights | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered insights and recommendations for your deals
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>
                Smart insights and actionable recommendations will appear here.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Insights & Recommendations</h3>
          <p className="text-muted-foreground max-w-md mt-2">
            This page will provide AI-generated insights including deal risk analysis, 
            optimal lender matching suggestions, and strategic recommendations for closing deals faster.
          </p>
        </div>
      </div>
    </>
  );
}

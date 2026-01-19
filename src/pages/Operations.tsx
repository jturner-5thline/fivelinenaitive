import { Helmet } from "react-helmet-async";
import { Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Operations() {
  return (
    <>
      <Helmet>
        <title>Operations | 5thLine</title>
      </Helmet>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
          <p className="text-muted-foreground mt-1">
            Manage your operational workflows and processes
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>
                Operations management tools will be available here.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Operations Management</h3>
          <p className="text-muted-foreground max-w-md mt-2">
            This page will help you streamline operational workflows, track resources, 
            manage vendor relationships, and optimize business processes.
          </p>
        </div>
      </div>
    </>
  );
}

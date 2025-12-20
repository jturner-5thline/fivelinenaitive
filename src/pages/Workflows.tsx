import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Workflow, Plus } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Workflows() {
  return (
    <>
      <Helmet>
        <title>Workflows - nAItive</title>
        <meta name="description" content="Manage your automated workflows" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  Workflows
                </h1>
                <p className="text-muted-foreground">Automate your deal and lender processes</p>
              </div>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Workflow
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Workflow className="h-5 w-5" />
                  Your Workflows
                </CardTitle>
                <CardDescription>
                  Create automated workflows to streamline your processes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Workflow className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No workflows yet</p>
                  <p className="text-sm mt-1">
                    Create your first workflow to automate repetitive tasks
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}

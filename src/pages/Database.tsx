import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Database as DatabaseIcon, Building2, ChevronRight } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Database() {
  return (
    <>
      <Helmet>
        <title>Database - nAItive</title>
        <meta name="description" content="Manage your database and directories" />
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
            <div>
              <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] flex items-center gap-2">
                <DatabaseIcon className="h-6 w-6 text-foreground" />
                Database
              </h1>
              <p className="text-muted-foreground">Manage your directories and data</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Directories
                </CardTitle>
                <CardDescription>Manage your lender and contact directories</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link
                  to="/lenders"
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-medium">Lenders</p>
                    <p className="text-sm text-muted-foreground">
                      View and manage your lender directory
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}

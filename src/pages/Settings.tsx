import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal, ChevronRight, User } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LenderStagesSettings } from '@/components/settings/LenderStagesSettings';
import { LenderSubstagesSettings } from '@/components/settings/LenderSubstagesSettings';
import { PassReasonsSettings } from '@/components/settings/PassReasonsSettings';
import { DealTypesSettings } from '@/components/settings/DealTypesSettings';

export default function Settings() {
  return (
    <>
      <Helmet>
        <title>Settings - nAItive</title>
        <meta name="description" content="Manage application settings" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>

          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Settings</h1>
              <p className="text-muted-foreground">Manage your application settings</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Account
                </CardTitle>
                <CardDescription>Manage your profile and company information</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to="/account"
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-medium">Profile & Company</p>
                    <p className="text-sm text-muted-foreground">
                      Your personal info and company details
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>

            <LenderStagesSettings />

            <LenderSubstagesSettings />

            <PassReasonsSettings />

            <DealTypesSettings />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
                  Preferences
                </CardTitle>
                <CardDescription>Customize your personal preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to="/preferences"
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="font-medium">User Preferences</p>
                    <p className="text-sm text-muted-foreground">
                      Theme, notifications, and regional settings
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

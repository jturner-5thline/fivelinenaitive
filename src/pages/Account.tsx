import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Button } from '@/components/ui/button';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { CompanySettings } from '@/components/settings/CompanySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';

export default function Account() {
  return (
    <>
      <Helmet>
        <title>Account - nAItive</title>
        <meta name="description" content="Manage your account settings" />
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
              <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Account</h1>
              <p className="text-muted-foreground">Manage your profile and company information</p>
            </div>

            <ProfileSettings />

            <CompanySettings />

            <NotificationSettings />
          </div>
        </main>
      </div>
    </>
  );
}

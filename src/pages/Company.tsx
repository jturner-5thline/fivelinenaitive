import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyProfileSettings } from '@/components/company/CompanyProfileSettings';
import { CompanyMembersSettings } from '@/components/company/CompanyMembersSettings';
import { CreateCompanyDialog } from '@/components/company/CreateCompanyDialog';
import { useCompany } from '@/hooks/useCompany';
import { Loader2, Building2 } from 'lucide-react';

export default function Company() {
  const { company, isLoading, isAdmin } = useCompany();

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Company - nAItive</title>
        </Helmet>
        <div className="min-h-screen bg-background">
          <DealsHeader />
          <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
        </div>
      </>
    );
  }

  if (!company) {
    return (
      <>
        <Helmet>
          <title>Company - nAItive</title>
        </Helmet>
        <div className="min-h-screen bg-background">
          <DealsHeader />
          <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
            <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
              <Link to="/settings">
                <ArrowLeft className="h-4 w-4" />
                Back to Settings
              </Link>
            </Button>

            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Building2 className="h-12 w-12 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No Company Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md">
                Create a company to manage your team, share deals, and collaborate with your colleagues.
              </p>
              <CreateCompanyDialog />
            </div>
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{company.name} - Company Settings</title>
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/settings">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Link>
          </Button>

          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                {company.name}
              </h1>
              <p className="text-muted-foreground">
                {isAdmin ? 'Manage your company settings and team members' : 'View your company information'}
              </p>
            </div>

            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList>
                <TabsTrigger value="profile">Company Profile</TabsTrigger>
                <TabsTrigger value="members">Team Members</TabsTrigger>
              </TabsList>

              <TabsContent value="profile">
                <CompanyProfileSettings />
              </TabsContent>

              <TabsContent value="members">
                <CompanyMembersSettings />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </>
  );
}

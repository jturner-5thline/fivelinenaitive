import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyProfileSettings } from '@/components/company/CompanyProfileSettings';
import { CompanyMembersSettings } from '@/components/company/CompanyMembersSettings';
import { CompanyJoinRequestsPanel } from '@/components/admin/CompanyJoinRequestsPanel';
import { CreateCompanyDialog } from '@/components/company/CreateCompanyDialog';
import { useCompany } from '@/hooks/useCompany';
import { usePendingJoinRequestCount } from '@/hooks/usePendingJoinRequestCount';
import { Loader2, Building2, UserPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Company() {
  const { company, isLoading, isAdmin } = useCompany();
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const [activeTab, setActiveTab] = useState<string>('profile');

  // Auto-switch to Join Requests tab when admin lands here with pending items,
  // so the red "1" badge from /settings has an obvious resolution path.
  useEffect(() => {
    if (isAdmin && pendingJoinCount > 0) {
      setActiveTab('join-requests');
    }
  }, [isAdmin, pendingJoinCount]);

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Company - naitive</title>
        </Helmet>
        <div>
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
          <title>Company - naitive</title>
        </Helmet>
        <div>
          <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
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

      <div>

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {isAdmin && pendingJoinCount > 0 && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <UserPlus className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-destructive">
                  {pendingJoinCount} pending join {pendingJoinCount === 1 ? 'request' : 'requests'}
                </AlertTitle>
                <AlertDescription>
                  Someone is asking to join your company. Review and approve or
                  decline them in the <button
                    type="button"
                    onClick={() => setActiveTab('join-requests')}
                    className="font-medium underline underline-offset-2 hover:text-foreground"
                  >Join Requests</button> tab below. The badge in Settings will
                  clear automatically once all requests are resolved.
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="profile">Company Profile</TabsTrigger>
                <TabsTrigger value="members">Team Members</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="join-requests" className="flex items-center gap-1.5">
                    Join Requests
                    {pendingJoinCount > 0 && (
                      <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
                        {pendingJoinCount}
                      </span>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="profile">
                <CompanyProfileSettings />
              </TabsContent>

              <TabsContent value="members">
                <CompanyMembersSettings />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="join-requests">
                  <CompanyJoinRequestsPanel />
                </TabsContent>
              )}
            </Tabs>
          </div>
        </main>
      </div>
    </>
  );
}

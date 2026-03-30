import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, Building2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { CrmCompaniesTable } from '@/components/crm-companies/CrmCompaniesTable';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function CrmCompanies() {
  const { data: companies = [], isLoading } = useCrmCompanies();
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const hasSyncedCompanies = companies.some(c => c.synced_with_hubspot);
  const showSyncBanner = !isLoading && companies.length === 0;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      let afterCursor: string | undefined;
      let totalSynced = 0;
      let pass = 0;

      do {
        pass++;
        const body = afterCursor ? { after: afterCursor } : {};
        const { data, error } = await supabase.functions.invoke('sync-hubspot-companies', { body });
        if (error) throw error;
        const result = data as { count?: number; error?: string; timed_out?: boolean; resume_after?: string };
        if (result.error) throw new Error(result.error);

        totalSynced += result.count || 0;
        afterCursor = result.timed_out ? result.resume_after : undefined;

        if (result.timed_out) {
          toast.info(`Synced ${totalSynced} companies so far, continuing...`);
        }
      } while (afterCursor);

      toast.success(`Synced ${totalSynced} companies from HubSpot`);
      queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
    } catch (error: any) {
      toast.error('Failed to sync companies', { description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const filtered = (() => {
    switch (quickFilter) {
      case 'customers': return companies.filter(c => c.lifecycle_stage === 'customer');
      case 'prospects': return companies.filter(c => c.company_type === 'prospect');
      case 'churn_risk': return companies.filter(c => c.lifecycle_stage === 'churn_risk');
      case 'no_activity_30d': return companies.filter(c => {
        if (!c.last_activity_date) return true;
        return Date.now() - new Date(c.last_activity_date).getTime() > 30 * 86400000;
      });
      case 'renewal_90d': return companies.filter(c => {
        if (!c.renewal_date) return false;
        const diff = new Date(c.renewal_date).getTime() - Date.now();
        return diff > 0 && diff < 90 * 86400000;
      });
      default: return companies;
    }
  })();

  return (
    <>
      <Helmet>
        <title>Companies | nAItive</title>
        <meta name="description" content="Manage B2B accounts, customers, and prospects." />
      </Helmet>

      <div className="bg-transparent">
        <DealsHeader />
        <main className="w-full px-4 pt-4 pb-3 sm:px-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Companies</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Sync HubSpot
              </Button>
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
              <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Company</Button>
            </div>
          </div>

          {showSyncBanner && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">No companies yet</p>
                <p className="text-xs text-muted-foreground">Sync your HubSpot companies to populate this page.</p>
              </div>
              <Button size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Building2 className="h-4 w-4 mr-1.5" />}
                Sync from HubSpot
              </Button>
            </div>
          )}

          <Tabs value={quickFilter} onValueChange={setQuickFilter}>
            <TabsList>
              <TabsTrigger value="all">All ({companies.length})</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="prospects">Prospects</TabsTrigger>
              <TabsTrigger value="churn_risk">Churn Risk</TabsTrigger>
              <TabsTrigger value="renewal_90d">Renewals 90d</TabsTrigger>
              <TabsTrigger value="no_activity_30d">No Activity 30d</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <CrmCompaniesTable companies={filtered} />
          )}
        </main>
      </div>

      <CreateCrmCompanyModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

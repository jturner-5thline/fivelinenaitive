import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { CrmCompaniesTable } from '@/components/crm-companies/CrmCompaniesTable';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { Loader2 } from 'lucide-react';

export default function CrmCompanies() {
  const { data: companies = [], isLoading } = useCrmCompanies();
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');

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

      <div className="bg-background min-h-screen">
        <div className="container mx-auto py-6 px-4 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Manage B2B accounts and customer relationships</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
              <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Company</Button>
            </div>
          </div>

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
        </div>
      </div>

      <CreateCrmCompanyModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

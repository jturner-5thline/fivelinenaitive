import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCrmCompany } from '@/hooks/useCrmCompanies';
import { CompanyDetailContent } from '@/components/crm/CompanyDetailContent';

export default function CrmCompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company } = useCrmCompany(id);

  return (
    <>
      <Helmet><title>{company?.name || 'Company'} | naitive</title></Helmet>
      <div className="min-h-screen">
        <div className="container mx-auto py-6 px-4 space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate('/crm-companies')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Companies
          </Button>

          {id && <CompanyDetailContent companyId={id} onDeleted={() => navigate('/crm-companies')} />}
        </div>
      </div>
    </>
  );
}

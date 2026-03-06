import React, { createContext, useContext, ReactNode } from 'react';
import type { Company } from '@/hooks/useCompany';

interface AdminCompanyOverride {
  company: Company;
  companyId: string;
}

const AdminCompanyOverrideContext = createContext<AdminCompanyOverride | null>(null);

export function AdminCompanyOverrideProvider({ 
  company, 
  children 
}: { 
  company: Company; 
  children: ReactNode; 
}) {
  return (
    <AdminCompanyOverrideContext.Provider value={{ company, companyId: company.id }}>
      {children}
    </AdminCompanyOverrideContext.Provider>
  );
}

export function useAdminCompanyOverride() {
  return useContext(AdminCompanyOverrideContext);
}

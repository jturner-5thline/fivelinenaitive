import { useCallback, useEffect, useState } from 'react';
import { useCompanyLinkSearch } from '@/hooks/useCompanyLinkSearch';
import { EntitySearchModal } from './EntitySearchModal';

interface CompanySearchModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onConfirm: (ids: string[]) => void;
  confirming?: boolean;
}

export function CompanySearchModal(props: CompanySearchModalProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useCompanyLinkSearch(debouncedSearch, page, props.open);
  return <EntitySearchModal {...props}
    placeholder="Search companies..."
    options={(query.data?.data ?? []).map(company => ({
      id: company.id, label: company.name,
      sublabel: [company.domain, ...(company.additional_domains ?? [])].filter(Boolean).join(' · '),
    }))}
    onSearchChange={onSearchChange}
    isLoading={query.isFetching || search !== debouncedSearch}
    error={query.isError ? 'Unable to load companies' : undefined}
    onRetry={() => { void query.refetch(); }}
    page={page} totalPages={query.data?.totalPages ?? 0} onPageChange={setPage}
  />;
}
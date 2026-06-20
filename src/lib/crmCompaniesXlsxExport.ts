import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { applyFiltersToQuery } from '@/lib/filterUtils';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';

interface ExportParams {
  orgCompanyId: string;
  quickFilter?: string;
  advancedFilters?: FilterRule[];
  matchMode?: MatchMode;
}

const EXPORT_COLUMNS =
  'id, name, created_at, domain, hq_city, hq_country, industry, employee_count, employee_range, website_url, description, custom_fields';

function fmtDate(v: any): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export async function exportCrmCompaniesToXlsx(params: ExportParams): Promise<number> {
  const { orgCompanyId, quickFilter, advancedFilters = [], matchMode = 'all' } = params;

  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];

  while (true) {
    let query = supabase
      .from('crm_companies')
      .select(EXPORT_COLUMNS)
      .eq('org_company_id', orgCompanyId);

    if (quickFilter && quickFilter !== 'all') {
      switch (quickFilter) {
        case 'customers':
          query = query.eq('lifecycle_stage', 'customer');
          break;
        case 'prospects':
          query = query.eq('company_type', 'prospect');
          break;
        case 'churn_risk':
          query = query.eq('lifecycle_stage', 'churn_risk');
          break;
        case 'no_activity_30d': {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
          query = query.or(`last_activity_date.is.null,last_activity_date.lt.${thirtyDaysAgo}`);
          break;
        }
        case 'renewal_90d': {
          const now = new Date().toISOString();
          const ninetyDays = new Date(Date.now() + 90 * 86400000).toISOString();
          query = query.gt('renewal_date', now).lt('renewal_date', ninetyDays);
          break;
        }
      }
    }
    if (advancedFilters.length > 0) {
      query = applyFiltersToQuery(query, advancedFilters, matchMode);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Companies');
  ws.columns = [
    { header: 'Company name', key: 'name', width: 32 },
    { header: 'Create Date', key: 'create_date', width: 14 },
    { header: 'Company Domain Name', key: 'domain', width: 28 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'Country/Region', key: 'country', width: 18 },
    { header: 'Industry', key: 'industry', width: 22 },
    { header: 'Number of Employees', key: 'employee_count', width: 18 },
    { header: 'Year Founded', key: 'founded_year', width: 14 },
    { header: 'Company Financing Status', key: 'financing_status', width: 22 },
    { header: 'Company URL', key: 'website_url', width: 36 },
    { header: 'Employee range', key: 'employee_range', width: 18 },
    { header: 'Description', key: 'description', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const c of rows as any[]) {
    const cf = c.custom_fields || {};
    ws.addRow({
      name: c.name || '',
      create_date: fmtDate(c.created_at),
      domain: c.domain || '',
      city: c.hq_city || '',
      country: c.hq_country || '',
      industry: c.industry || '',
      employee_count: c.employee_count ?? '',
      founded_year: cf.founded_year ?? '',
      financing_status: cf.financing_status ?? cf.hs_financing_status ?? '',
      website_url: c.website_url || '',
      employee_range: c.employee_range || '',
      description: c.description || '',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `companies-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return rows.length;
}
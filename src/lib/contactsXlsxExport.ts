import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { applyFiltersToQuery } from '@/lib/filterUtils';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';

interface ExportParams {
  orgCompanyId: string;
  quickFilter?: string;
  advancedFilters?: FilterRule[];
  matchMode?: MatchMode;
  search?: string;
  format?: 'xlsx' | 'csv';
}

const EXPORT_COLUMNS =
  'id, first_name, last_name, email, hs_city, hs_contact_status, hs_contact_type, created_at, hs_notes_last_contacted, hs_industry, job_title, hs_hs_email_optout, email_domain_normalized, hs_state, hs_company_name, linkedin_url, phone_work, phone_mobile, crm_company:crm_companies!crm_company_id(name)';

function fmtDate(v: any): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function fmtBool(v: any): string {
  if (v === true || v === 'true' || v === 1 || v === '1') return 'Yes';
  if (v === false || v === 'false' || v === 0 || v === '0') return 'No';
  return '';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v: any): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportContactsToXlsx(params: ExportParams): Promise<number> {
  const { orgCompanyId, quickFilter, advancedFilters = [], matchMode = 'all', search, format = 'xlsx' } = params;

  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];

  while (true) {
    let query = supabase
      .from('contacts')
      .select(EXPORT_COLUMNS)
      .eq('org_company_id', orgCompanyId);

    const s = search?.trim();
    if (s) {
      const parts = s.split(/\s+/).filter(Boolean);
      let ors: string[] = [
        `full_name.ilike.%${s}%`,
        `first_name.ilike.%${s}%`,
        `last_name.ilike.%${s}%`,
        `email.ilike.%${s}%`,
        `job_title.ilike.%${s}%`,
      ];
      if (parts.length >= 2) {
        ors = [
          `full_name.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`,
        ];
      }
      query = query.or(ors.join(','));
    }

    if (quickFilter && quickFilter !== 'all') {
      switch (quickFilter) {
        case 'new_leads':
          query = query.eq('status', 'new');
          break;
        case 'meeting_scheduled':
          query = query.eq('status', 'meeting_scheduled');
          break;
        case 'high_score':
          query = query.gte('contact_score', 70);
          break;
        case 'no_activity_7d': {
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          query = query.or(`last_activity_date.is.null,last_activity_date.lt.${sevenDaysAgo}`);
          break;
        }
        case 'no_email':
          query = query.or('email.is.null,email.eq.');
          break;
        case 'no_company':
          query = query.is('crm_company_id', null);
          break;
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

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const headers = [
      'First Name', 'Last Name', 'Email', 'City', 'Lead Status', 'Contact Type', 'Create Date',
      'Last Contacted', 'Industry', 'Job Title', 'Opted out of email: One to One', 'Email Domain',
      'State/Region', 'Company Name', 'Linkedin Url', 'Phone Number', 'Mobile Phone Number',
    ];
    const lines = [headers.join(',')];
    for (const c of rows as any[]) {
      lines.push([
        c.first_name || '', c.last_name || '', c.email || '', c.hs_city || '',
        c.hs_contact_status || '', c.hs_contact_type || '', fmtDate(c.created_at),
        fmtDate(c.hs_notes_last_contacted), c.hs_industry || '', c.job_title || '',
        fmtBool(c.hs_hs_email_optout), c.email_domain_normalized || '', c.hs_state || '',
        c.crm_company?.name || c.hs_company_name || '', c.linkedin_url || '',
        c.phone_work || '', c.phone_mobile || '',
      ].map(csvCell).join(','));
    }
    downloadBlob(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), `contacts-${stamp}.csv`);
    return rows.length;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contacts');
  ws.columns = [
    { header: 'First Name', key: 'first_name', width: 18 },
    { header: 'Last Name', key: 'last_name', width: 18 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'Lead Status', key: 'lead_status', width: 18 },
    { header: 'Contact Type', key: 'contact_type', width: 18 },
    { header: 'Create Date', key: 'create_date', width: 14 },
    { header: 'Last Contacted', key: 'last_contacted', width: 14 },
    { header: 'Industry', key: 'industry', width: 22 },
    { header: 'Job Title', key: 'job_title', width: 24 },
    { header: 'Opted out of email: One to One', key: 'opt_out_one_to_one', width: 28 },
    { header: 'Email Domain', key: 'email_domain', width: 24 },
    { header: 'State/Region', key: 'state', width: 16 },
    { header: 'Company Name', key: 'company_name', width: 28 },
    { header: 'Linkedin Url', key: 'linkedin_url', width: 36 },
    { header: 'Phone Number', key: 'phone_work', width: 18 },
    { header: 'Mobile Phone Number', key: 'phone_mobile', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const c of rows as any[]) {
    const company = c.crm_company?.name || c.hs_company_name || '';
    ws.addRow({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      email: c.email || '',
      city: c.hs_city || '',
      lead_status: c.hs_contact_status || '',
      contact_type: c.hs_contact_type || '',
      create_date: fmtDate(c.created_at),
      last_contacted: fmtDate(c.hs_notes_last_contacted),
      industry: c.hs_industry || '',
      job_title: c.job_title || '',
      opt_out_one_to_one: fmtBool(c.hs_hs_email_optout),
      email_domain: c.email_domain_normalized || '',
      state: c.hs_state || '',
      company_name: company,
      linkedin_url: c.linkedin_url || '',
      phone_work: c.phone_work || '',
      phone_mobile: c.phone_mobile || '',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `contacts-${stamp}.xlsx`);

  return rows.length;
}
export interface AgreementFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  defaultValue: string;
  placeholder?: string;
  options?: string[]; // for select type
}

export interface AgreementSubsection {
  id: string;
  title: string;
  enabled: boolean;
  fields: AgreementFieldDef[];
  template_text: string;
}

export interface AgreementQualifier {
  id: string;
  letter: string;
  text: string;
  enabled: boolean;
}

export interface AgreementSection {
  id: string;
  db_id?: string; // UUID from database
  template_id?: string;
  section_id: string;
  title: string;
  category: 'staple' | 'configurable' | 'optional';
  enabled: boolean;
  sort_order: number;
  description?: string;
  template_text: string;
  fields: AgreementFieldDef[];
  subsections?: AgreementSubsection[] | null;
  qualifiers?: AgreementQualifier[] | null;
}

export interface AgreementTemplate {
  id: string;
  company_id?: string;
  name: string;
  description?: string;
  created_by?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  sections: AgreementSection[];
}

export interface DraftedAgreement {
  id: string;
  template_id: string;
  deal_id: string;
  company_id?: string;
  created_by: string;
  field_values: Record<string, string>;
  section_overrides: Record<string, any>;
  status: 'draft' | 'finalized' | 'exported';
  created_at: string;
  updated_at: string;
}

export type ChartType = 'bar' | 'line' | 'pie' | 'area';

import { AgreementSection, AgreementQualifier } from './types';

const NUMBER_WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
};

export function numberToWord(n: number): string {
  return NUMBER_WORDS[n] || n.toString();
}

export function resolveTemplate(
  template: string,
  values: Record<string, string>,
  highlight: boolean = false
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // Special computed variables
    if (key === 'company_entity_type_clause') {
      const val = values['company_entity_type'];
      return val ? `, ${val}` : '';
    }
    if (key === 'marketing_permission_text') {
      return values['marketing_permission'] === 'granted' ? 'grants' : 'does not grant';
    }
    if (key === 'marketing_includes_clause') {
      const val = values['marketing_includes'];
      return val || '';
    }

    const val = values[key];
    if (val !== undefined && val !== '') {
      return val;
    }
    if (highlight) {
      return `<span class="text-primary font-mono text-sm bg-primary/10 px-1 rounded">{{${key}}}</span>`;
    }
    return `{{${key}}}`;
  });
}

export function resolveForExport(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key === 'company_entity_type_clause') {
      const val = values['company_entity_type'];
      return val ? `, ${val}` : '';
    }
    if (key === 'marketing_permission_text') {
      return values['marketing_permission'] === 'granted' ? 'grants' : 'does not grant';
    }
    if (key === 'marketing_includes_clause') {
      return values['marketing_includes'] || '';
    }
    const val = values[key];
    if (val !== undefined && val !== '') return val;
    return `[${key}]`;
  });
}

export function renderQualifierList(
  qualifiers: AgreementQualifier[],
  type: 'exhibit_a' | 'exhibit_b',
  values: Record<string, string>,
  highlight: boolean = false
): string {
  const enabled = qualifiers.filter(q => q.enabled);
  if (enabled.length === 0) return '';

  let intro = '';
  if (type === 'exhibit_a') {
    const minNum = parseInt(values['exhibit_a_min_qualifiers'] || '2', 10);
    const word = numberToWord(minNum);
    intro = `For purposes of this Agreement, a "Qualified" Term Sheet shall mean a credit-approved term sheet that satisfies any of the following: (i) it is executed by the Company; or (ii) it reflects at least ${word} (${minNum}) of the following Qualifiers:`;
  } else {
    intro = `For purposes of this Agreement, "Excluded Lenders" shall mean the following entities and their respective affiliates, (collectively, the "Excluded Lenders"):`;
  }

  const items = enabled.map((q, i) => {
    const separator = i === enabled.length - 1 ? '.' : (i === enabled.length - 2 ? '; or' : ';');
    return `(${q.letter}) ${q.text}${separator}`;
  });

  return `${intro}\n\n${items.join('\n')}`;
}

export function getDefaultValues(sections: AgreementSection[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const section of sections) {
    for (const field of section.fields || []) {
      values[field.key] = field.defaultValue || '';
    }
    if (section.subsections) {
      for (const sub of section.subsections) {
        for (const field of sub.fields || []) {
          values[field.key] = field.defaultValue || '';
        }
      }
    }
  }
  return values;
}

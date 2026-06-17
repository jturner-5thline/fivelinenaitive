import type { VdrDocument } from '@/components/vdr/types';

interface FolderKeywordMap {
  category: string;
  keywords: string[];
}

const FOLDER_KEYWORD_RULES: FolderKeywordMap[] = [
  {
    category: 'financial',
    keywords: [
      'balance sheet', 'income statement', 'cash flow', 'financial',
      'revenue', 'ebitda', 'budget', 'forecast', 'projection', 'model',
      'tax return', 'audit', 'p&l', 'pnl',
    ],
  },
  {
    // Short acronyms checked separately to avoid false positives
    category: 'financial',
    keywords: ['bs', 'is', 'cf'],
  },
  {
    category: 'kpi',
    keywords: [
      'kpi', 'metric', 'dashboard', 'mrr', 'arr', 'churn', 'retention',
      'nps', 'cac', 'ltv', 'growth',
    ],
  },
  {
    category: 'agreement',
    keywords: [
      'agreement', 'contract', 'nda', 'loi', 'term sheet', 'lease',
      'license', 'msa', 'sla', 'amendment',
    ],
  },
  {
    category: 'material',
    keywords: [
      'pitch deck', 'presentation', 'deck', 'overview', 'summary',
      'teaser', 'cim', 'memo', 'brochure',
    ],
  },
  {
    category: 'other',
    keywords: ['other'],
  },
];

// Map category keys to folder name search terms
const CATEGORY_FOLDER_TERMS: Record<string, string[]> = {
  financial: ['financial', 'finance'],
  kpi: ['kpi', 'metric'],
  agreement: ['agreement', 'contract', 'legal'],
  material: ['material', 'presentation', 'deck'],
  other: ['other', 'miscellaneous', 'general'],
};

/**
 * Classify a filename to the best-matching VDR folder path.
 * Returns the folder_path string (e.g. '/Financials/') or '/' if no match.
 */
export function classifyFileToFolder(
  filename: string,
  documents: VdrDocument[],
): string {
  const folders = documents.filter(d => d.is_folder && d.folder_path === '/');
  if (folders.length === 0) return '/';

  const nameLower = (filename ?? '').toLowerCase();
  // Strip extension for matching
  const nameNoExt = nameLower.replace(/\.[^.]+$/, '');

  for (const rule of FOLDER_KEYWORD_RULES) {
    const matched = rule.keywords.some(kw => {
      // For short acronyms (2-3 chars), require word boundary matching
      if (kw.length <= 3) {
        const re = new RegExp(`(?:^|[^a-z])${kw.replace(/[&]/g, '\\$&')}(?:$|[^a-z])`, 'i');
        return re.test(nameNoExt);
      }
      return nameNoExt.includes(kw);
    });

    if (matched) {
      // Find a folder whose name matches this category
      const searchTerms = CATEGORY_FOLDER_TERMS[rule.category] || [rule.category];
      const folder = folders.find(f => {
        const folderLower = (f.filename ?? '').toLowerCase();
        return searchTerms.some(term => folderLower.includes(term));
      });
      if (folder) {
        return `/${folder.filename}/`;
      }
    }
  }

  return '/';
}

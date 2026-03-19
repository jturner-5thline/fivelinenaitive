/**
 * Copilot utility functions for response formatting, stage display names, and typo correction.
 */

// ── Fix 5: Stage slug to display name mapping ──
const stageDisplayNames: Record<string, string> = {
  "final-credit-items": "Final Credit Items",
  "proposal-issued": "Proposal Issued",
  "in-due-diligence": "In Due Diligence",
  "lenders-in-review": "Lenders in Review",
  "terms-issued": "Terms Issued",
  "agreement-pending": "Agreement Pending",
  "pre-credit-needs": "Pre-Credit Needs",
  "introductions": "Introductions",
  "on-hold": "On Hold",
  "closed": "Closed",
  "funded": "Funded",
  "unresponsive": "Unresponsive",
  "new-deal": "New Deal",
  "initial-review": "Initial Review",
  "credit-analysis": "Credit Analysis",
  "term-sheet-negotiation": "Term Sheet Negotiation",
  "closing": "Closing",
  "post-closing": "Post-Closing",
  "monitoring": "Monitoring",
  "workout": "Workout",
};

export function getStageDisplayName(slug: string): string {
  if (!slug) return slug;
  const lower = slug.toLowerCase().trim();
  if (stageDisplayNames[lower]) return stageDisplayNames[lower];
  // Fallback: convert slug to title case
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Fix 1: JSON Response Formatting ──

/**
 * Detects if a string is likely raw JSON and formats it into readable markdown.
 * Returns null if the content is not JSON or formatting fails.
 */
export function formatAIResponse(content: string): string | null {
  const trimmed = content.trim();
  
  // Quick check: does it look like JSON?
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  
  try {
    const parsed = JSON.parse(trimmed);
    return jsonToMarkdown(parsed);
  } catch {
    // Try to extract JSON from the content (might have text before/after)
    const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return jsonToMarkdown(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function jsonToMarkdown(obj: any, depth = 0): string {
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (obj === null || obj === undefined) return '';
  
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') return `- ${item}`;
      if (typeof item === 'object' && item !== null) {
        if (item.title || item.label || item.name) {
          const title = item.title || item.label || item.name;
          const body = item.text || item.content || item.description || item.body || '';
          const bullets = item.bullets || item.items || item.points || [];
          let md = `### ${title}\n\n`;
          if (body) md += `${body}\n\n`;
          if (Array.isArray(bullets) && bullets.length > 0) {
            md += bullets.map((b: any) => `- ${typeof b === 'string' ? b : JSON.stringify(b)}`).join('\n') + '\n\n';
          }
          return md;
        }
        return `- ${jsonToMarkdown(item, depth + 1)}`;
      }
      return `- ${String(item)}`;
    }).join('\n');
  }

  // Handle known response structures
  if (obj.deal_summary) return formatDealSummary(obj.deal_summary);
  if (obj.type === 'report' && obj.content?.sections) return formatReport(obj);
  if (obj.classification && obj.plan) return formatClassificationPlan(obj);
  if (obj.sections && Array.isArray(obj.sections)) return formatSections(obj.sections);

  // Generic object formatting
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const label = key
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`**${label}:** ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`\n**${label}:**`);
      lines.push(jsonToMarkdown(value, depth + 1));
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`\n## ${label}\n`);
      lines.push(jsonToMarkdown(value, depth + 1));
    }
  }
  return lines.join('\n');
}

function formatDealSummary(summary: any): string {
  let md = '## Deal Summary\n\n';
  if (typeof summary === 'string') return md + summary;
  
  // Build table for key fields
  const tableFields = ['deal_name', 'company', 'borrower', 'sponsor', 'facility_type', 'size', 'amount', 'pricing', 'tenor', 'collateral', 'use_of_proceeds', 'status'];
  const tableRows: string[] = [];
  
  for (const field of tableFields) {
    if (summary[field]) {
      const label = field.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      tableRows.push(`| **${label}** | ${summary[field]} |`);
    }
  }
  
  if (tableRows.length > 0) {
    md += '| Field | Details |\n|-------|--------|\n';
    md += tableRows.join('\n') + '\n\n';
  }
  
  // Handle remaining fields
  for (const [key, value] of Object.entries(summary)) {
    if (tableFields.includes(key)) continue;
    const label = key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (Array.isArray(value)) {
      md += `\n### ${label}\n${(value as any[]).map(v => `- ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}\n`;
    } else if (typeof value === 'object' && value !== null) {
      md += `\n### ${label}\n${jsonToMarkdown(value, 1)}\n`;
    } else {
      md += `**${label}:** ${value}\n\n`;
    }
  }
  
  return md;
}

function formatReport(obj: any): string {
  let md = `## ${obj.label || 'Report'}\n\n`;
  if (obj.content?.sections) {
    md += formatSections(obj.content.sections);
  }
  return md;
}

function formatClassificationPlan(obj: any): string {
  let md = `*${obj.classification}*\n\n`;
  if (typeof obj.plan === 'string') {
    md += obj.plan;
  } else {
    md += jsonToMarkdown(obj.plan, 0);
  }
  // Add any other fields
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'classification' || key === 'plan') continue;
    const label = key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (typeof value === 'string') md += `\n\n**${label}:** ${value}`;
    else if (typeof value === 'object') md += `\n\n### ${label}\n${jsonToMarkdown(value, 1)}`;
  }
  return md;
}

function formatSections(sections: any[]): string {
  return sections.map(section => {
    let md = `### ${section.title || section.heading || section.name || 'Section'}\n\n`;
    if (section.text || section.body || section.content) {
      md += `${section.text || section.body || section.content}\n\n`;
    }
    if (section.bullets || section.items || section.points) {
      const items = section.bullets || section.items || section.points;
      md += items.map((b: any) => `- ${typeof b === 'string' ? b : JSON.stringify(b)}`).join('\n') + '\n\n';
    }
    if (section.subsections) {
      md += formatSections(section.subsections);
    }
    return md;
  }).join('');
}

// ── Fix 6: Conversation Mutation Types ──
export interface ConversationMutation {
  type: string;
  deal?: string;
  dealId?: string;
  detail: string;
  timestamp: string;
}

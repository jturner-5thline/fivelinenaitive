import { useState, useEffect, useMemo } from 'react';
import { Link2, CheckCircle2, AlertTriangle, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DataIssue, DetectedStatement } from '../types';

interface ChecklistItem {
  id: string;
  name: string;
  category: string | null;
  is_complete: boolean;
  linked_issue_ids: string[];
}

interface DataRoomIntegrationProps {
  dealId: string;
  issues: DataIssue[];
  statements: DetectedStatement[];
  className?: string;
}

const CATEGORY_MAPPING: Record<string, string[]> = {
  'Financial Statements': ['income_statement', 'balance_sheet', 'cash_flow'],
  'Debt Schedule': ['debt_schedule'],
  'Revenue Detail': ['revenue_detail'],
  'Working Capital': ['working_capital'],
};

export function DataRoomIntegration({ dealId, issues, statements, className }: DataRoomIntegrationProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchChecklist() {
      setIsLoading(true);
      const { data } = await supabase
        .from('deal_checklist_items')
        .select('id, name, category')
        .eq('deal_id', dealId)
        .order('position');

      const { data: statuses } = await supabase
        .from('deal_checklist_status')
        .select('deal_checklist_item_id, is_complete')
        .eq('deal_id', dealId);

      const statusMap = new Map(
        (statuses || []).map(s => [s.deal_checklist_item_id, s.is_complete])
      );

      setChecklistItems(
        (data || []).map(item => ({
          ...item,
          is_complete: statusMap.get(item.id) || false,
          linked_issue_ids: [],
        }))
      );
      setIsLoading(false);
    }
    fetchChecklist();
  }, [dealId]);

  // Auto-match findings to checklist items
  const linkedItems = useMemo(() => {
    return checklistItems.map(item => {
      const matchedIssues: string[] = [];

      // Match by category
      const itemCatLower = (item.category || '').toLowerCase();
      const itemNameLower = item.name.toLowerCase();

      for (const issue of issues) {
        const issueText = `${issue.title} ${issue.description}`.toLowerCase();
        if (itemNameLower && issueText.includes(itemNameLower.split(' ')[0])) {
          matchedIssues.push(issue.id);
        }
      }

      // Match by statement type detection
      for (const [category, types] of Object.entries(CATEGORY_MAPPING)) {
        if (itemNameLower.includes(category.toLowerCase()) || itemCatLower.includes(category.toLowerCase())) {
          const hasStatement = statements.some(s => types.includes(s.type));
          if (hasStatement && !matchedIssues.length) {
            // Statement found, no issues = good
          }
        }
      }

      return { ...item, linked_issue_ids: matchedIssues };
    });
  }, [checklistItems, issues, statements]);

  const detectedCategories = useMemo(() => {
    const found: string[] = [];
    for (const s of statements) {
      if (s.type === 'income_statement') found.push('Income Statement');
      if (s.type === 'balance_sheet') found.push('Balance Sheet');
      if (s.type === 'cash_flow') found.push('Cash Flow Statement');
      if (s.type === 'debt_schedule') found.push('Debt Schedule');
    }
    return [...new Set(found)];
  }, [statements]);

  const issuesByChecklistItem = useMemo(() => {
    const map = new Map<string, DataIssue[]>();
    for (const item of linkedItems) {
      const matched = issues.filter(i => item.linked_issue_ids.includes(i.id));
      if (matched.length) map.set(item.id, matched);
    }
    return map;
  }, [linkedItems, issues]);

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border/30 p-4", className)}>
        <p className="text-xs text-muted-foreground text-center py-8">Loading checklist…</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border/30", className)}>
      <div className="p-4 border-b border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Data Room Integration</h3>
          <Badge variant="outline" className="text-[10px]">
            {detectedCategories.length} types detected
          </Badge>
        </div>
      </div>

      <div className="p-4">
        {/* Auto-detected documents */}
        {detectedCategories.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Detected Financials</p>
            <div className="flex flex-wrap gap-1.5">
              {detectedCategories.map(cat => (
                <Badge key={cat} className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Checklist items with findings */}
        {linkedItems.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist Items</p>
            {linkedItems.map(item => {
              const itemIssues = issuesByChecklistItem.get(item.id) || [];
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border",
                    itemIssues.length > 0 ? "border-amber-500/20 bg-amber-500/5" : "border-border/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.is_complete ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                    )}
                    <span className="text-xs font-medium">{item.name}</span>
                    {item.category && (
                      <Badge variant="outline" className="text-[9px]">{item.category}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {itemIssues.length > 0 && (
                      <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/30 gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {itemIssues.length} finding{itemIssues.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No checklist items found for this deal</p>
            <p className="text-[10px] mt-1">Add checklist items in the Data Room to see them here</p>
          </div>
        )}

        {/* Issues summary */}
        {issues.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Diligence Findings ({issues.length})
            </p>
            <div className="space-y-1">
              {issues.slice(0, 5).map(issue => (
                <div key={issue.id} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0",
                    issue.severity === 'error' ? "bg-destructive" : issue.severity === 'warning' ? "bg-amber-500" : "bg-primary"
                  )} />
                  <span className="text-muted-foreground">{issue.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { History, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useTemplateVersions, TemplateVersion } from '@/hooks/useTemplateVersions';
import type { WorkflowAction, TriggerType } from '@/components/workflows/WorkflowBuilder';

interface TemplateVersionHistoryProps {
  templateId: string;
  templateName: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion: (data: {
    name: string;
    description: string | null;
    category: string;
    trigger_type: TriggerType;
    trigger_config: Record<string, any>;
    actions: WorkflowAction[];
    tags: string[];
  }) => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  deal_stage_change: 'Deal Stage Change',
  lender_stage_change: 'Lender Stage Change',
  new_deal: 'New Deal Created',
  deal_closed: 'Deal Closed',
  scheduled: 'Scheduled',
};

export function TemplateVersionHistory({
  templateId,
  templateName,
  isOpen,
  onClose,
  onRestoreVersion,
}: TemplateVersionHistoryProps) {
  const { versions, isLoading, fetchVersions, restoreVersion } = useTemplateVersions();
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && templateId) {
      fetchVersions(templateId);
    }
  }, [isOpen, templateId, fetchVersions]);

  const handleRestore = async (version: TemplateVersion) => {
    const data = await restoreVersion(version);
    if (data) {
      onRestoreVersion(data);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Template Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of "{templateName}"
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-4 border rounded-lg">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No version history</p>
              <p className="text-sm mt-1">
                Versions are saved each time you update the template
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version, index) => (
                <Collapsible
                  key={version.id}
                  open={expandedVersion === version.id}
                  onOpenChange={(open) => setExpandedVersion(open ? version.id : null)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Badge variant={index === 0 ? 'default' : 'secondary'} className="text-xs">
                            v{version.version_number}
                          </Badge>
                          <div>
                            <p className="font-medium">{version.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                              {version.change_summary && ` • ${version.change_summary}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {index === 0 && (
                            <Badge variant="outline" className="text-xs">Current</Badge>
                          )}
                          {expandedVersion === version.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-2 border-t bg-muted/30 space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Category</p>
                            <p className="font-medium capitalize">{version.category}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Trigger</p>
                            <p className="font-medium">{TRIGGER_LABELS[version.trigger_type] || version.trigger_type}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Actions</p>
                            <p className="font-medium">{version.actions.length} action(s)</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Created</p>
                            <p className="font-medium">{format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}</p>
                          </div>
                        </div>

                        {version.tags.length > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Tags</p>
                            <div className="flex flex-wrap gap-1">
                              {version.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {version.description && (
                          <div>
                            <p className="text-sm text-muted-foreground">Description</p>
                            <p className="text-sm">{version.description}</p>
                          </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                          {index > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleRestore(version)}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Restore This Version
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Bell, Zap, Mail, CheckCircle2, Clock, Send, ChevronDown, ChevronUp, Search, FileCode, Users, Trash2, Bookmark, Star, Share2, Edit, BarChart2, Eye, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkflowTemplates, useDeleteWorkflowTemplate, useUpdateWorkflowTemplate, useIncrementTemplateUsage, CustomWorkflowTemplate } from '@/hooks/useWorkflowTemplates';
import { EditTemplateDialog, EditTemplateData } from './SaveTemplateDialog';
import { TemplatePreviewDialog } from './TemplatePreviewDialog';
import { TemplateImportDialog, useTemplateExport } from './TemplateImportExport';
import type { TriggerType, WorkflowAction, WorkflowData } from './WorkflowBuilder';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  actions: WorkflowAction[];
  tags: string[];
  isCustom?: boolean;
  isOwn?: boolean;
  isShared?: boolean;
  usageCount?: number;
}

const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  // Notifications category
  {
    id: 'new-deal-notification',
    name: 'New Deal Alert',
    description: 'Get notified instantly when a new deal is created in your pipeline',
    category: 'notifications',
    icon: <Bell className="h-5 w-5" />,
    triggerType: 'new_deal',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'New Deal Created',
          message: 'A new deal "{{dealName}}" has been added to your pipeline',
        },
      },
    ],
    tags: ['notification', 'new deal', 'alert'],
  },
  {
    id: 'stage-change-alert',
    name: 'Stage Change Alert',
    description: 'Get notified when any deal moves to a different stage',
    category: 'notifications',
    icon: <Bell className="h-5 w-5" />,
    triggerType: 'deal_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Deal Stage Changed',
          message: 'Deal "{{dealName}}" moved from {{previousStage}} to {{dealStage}}',
        },
      },
    ],
    tags: ['notification', 'stage', 'pipeline'],
  },
  {
    id: 'lender-update-notify',
    name: 'Lender Status Update',
    description: 'Notify when a lender changes their stage on a deal',
    category: 'notifications',
    icon: <Bell className="h-5 w-5" />,
    triggerType: 'lender_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Lender Stage Changed',
          message: 'Lender "{{lenderName}}" moved to {{lenderStage}} on deal "{{dealName}}"',
        },
      },
    ],
    tags: ['notification', 'lender', 'stage'],
  },
  // Integrations category
  {
    id: 'deal-closed-webhook',
    name: 'Deal Closed Webhook',
    description: 'Send deal data to an external system when a deal closes',
    category: 'integrations',
    icon: <Zap className="h-5 w-5" />,
    triggerType: 'deal_closed',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'webhook',
        config: {
          url: 'https://your-webhook-url.com/deal-closed',
        },
      },
    ],
    tags: ['webhook', 'integration', 'external'],
  },
  {
    id: 'new-deal-sync',
    name: 'New Deal CRM Sync',
    description: 'Sync new deals to your CRM or external system via webhook',
    category: 'integrations',
    icon: <FileCode className="h-5 w-5" />,
    triggerType: 'new_deal',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'webhook',
        config: {
          url: 'https://your-crm.com/api/deals',
        },
      },
    ],
    tags: ['webhook', 'crm', 'sync'],
  },
  // Deal Management category
  {
    id: 'stage-change-email',
    name: 'Stage Change Email',
    description: 'Email notification when a deal moves to a specific stage',
    category: 'deal-management',
    icon: <Mail className="h-5 w-5" />,
    triggerType: 'deal_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_email',
        config: {
          subject: 'Deal Stage Updated: {{dealName}}',
          body: 'The deal "{{dealName}}" has moved from {{previousStage}} to {{dealStage}}.',
        },
      },
    ],
    tags: ['email', 'stage', 'management'],
  },
  {
    id: 'deal-closed-celebration',
    name: 'Deal Won Celebration',
    description: 'Celebrate with notifications and emails when a deal is closed won',
    category: 'deal-management',
    icon: <CheckCircle2 className="h-5 w-5" />,
    triggerType: 'deal_closed',
    triggerConfig: { closedStatus: 'won' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Deal Closed Won! 🎉',
          message: 'Congratulations! "{{dealName}}" has been closed won!',
        },
      },
      {
        id: 'action-2',
        type: 'send_email',
        config: {
          subject: '🎉 Deal Closed: {{dealName}}',
          body: 'Great news! The deal "{{dealName}}" has been successfully closed.',
        },
      },
    ],
    tags: ['celebration', 'closed won', 'email', 'notification'],
  },
  {
    id: 'delayed-followup',
    name: 'Delayed Follow-up Reminder',
    description: 'Send a follow-up reminder 24 hours after a stage change',
    category: 'deal-management',
    icon: <Clock className="h-5 w-5" />,
    triggerType: 'deal_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'Follow-up Reminder',
          message: 'Remember to follow up on "{{dealName}}" - it moved to {{dealStage}} yesterday',
          delayMinutes: 1440,
        },
      },
    ],
    tags: ['delay', 'reminder', 'follow-up'],
  },
  // Team category
  {
    id: 'team-deal-notification',
    name: 'Team Deal Notification',
    description: 'Notify team members when a new high-value deal is created',
    category: 'team',
    icon: <Users className="h-5 w-5" />,
    triggerType: 'new_deal',
    triggerConfig: {},
    actions: [
      {
        id: 'action-1',
        type: 'send_notification',
        config: {
          title: 'New Team Deal',
          message: 'A new deal "{{dealName}}" has been added. Check it out!',
        },
      },
      {
        id: 'action-2',
        type: 'send_email',
        config: {
          subject: 'New Deal Alert: {{dealName}}',
          body: 'A new deal has been added to the pipeline. Deal: {{dealName}}',
        },
      },
    ],
    tags: ['team', 'notification', 'email'],
  },
  {
    id: 'lender-response-webhook',
    name: 'Lender Response Tracker',
    description: 'Track lender responses by sending data to your analytics system',
    category: 'integrations',
    icon: <Send className="h-5 w-5" />,
    triggerType: 'lender_stage_change',
    triggerConfig: { fromStage: '', toStage: '' },
    actions: [
      {
        id: 'action-1',
        type: 'webhook',
        config: {
          url: 'https://your-analytics.com/lender-response',
        },
      },
    ],
    tags: ['lender', 'analytics', 'webhook'],
  },
];

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  custom: { label: 'My Templates', icon: <Star className="h-4 w-4" /> },
  shared: { label: 'Shared by Team', icon: <Share2 className="h-4 w-4" /> },
  notifications: { label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  integrations: { label: 'Integrations', icon: <Zap className="h-4 w-4" /> },
  'deal-management': { label: 'Deal Management', icon: <FileCode className="h-4 w-4" /> },
  team: { label: 'Team', icon: <Users className="h-4 w-4" /> },
  other: { label: 'Other', icon: <FileCode className="h-4 w-4" /> },
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  deal_stage_change: 'Deal Stage Change',
  lender_stage_change: 'Lender Stage Change',
  new_deal: 'New Deal Created',
  deal_closed: 'Deal Closed',
  scheduled: 'Scheduled',
};

interface WorkflowTemplatesLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (data: WorkflowData) => void;
}

export function WorkflowTemplatesLibrary({ open, onOpenChange, onSelectTemplate }: WorkflowTemplatesLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['custom', 'shared', 'notifications', 'deal-management']);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CustomWorkflowTemplate | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const { data: customTemplates = [], isLoading, refetch } = useWorkflowTemplates();
  const deleteTemplate = useDeleteWorkflowTemplate();
  const updateTemplate = useUpdateWorkflowTemplate();
  const incrementUsage = useIncrementTemplateUsage();
  const { exportTemplates } = useTemplateExport();

  // Separate own templates from shared templates
  const ownTemplates = customTemplates.filter(t => t.isOwn);
  const sharedTemplates = customTemplates.filter(t => !t.isOwn);

  // Convert own templates to WorkflowTemplate format
  const ownTemplatesFormatted: WorkflowTemplate[] = ownTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description || '',
    category: 'custom',
    icon: <Bookmark className="h-5 w-5" />,
    triggerType: t.trigger_type,
    triggerConfig: t.trigger_config,
    actions: t.actions,
    tags: t.tags,
    isCustom: true,
    isOwn: true,
    isShared: t.is_shared,
    usageCount: t.usage_count,
  }));

  // Convert shared templates to WorkflowTemplate format
  const sharedTemplatesFormatted: WorkflowTemplate[] = sharedTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description || '',
    category: 'shared',
    icon: <Share2 className="h-5 w-5" />,
    triggerType: t.trigger_type,
    triggerConfig: t.trigger_config,
    actions: t.actions,
    tags: t.tags,
    isCustom: true,
    isOwn: false,
    isShared: true,
    usageCount: t.usage_count,
  }));

  // Combine all templates
  const allTemplates = [...ownTemplatesFormatted, ...sharedTemplatesFormatted, ...BUILTIN_TEMPLATES];

  const filteredTemplates = allTemplates.filter(template => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.tags.some(tag => tag.toLowerCase().includes(query))
    );
  });

  const templatesByCategory = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, WorkflowTemplate[]>);

  // Sort categories to show custom first, then shared, then others
  const categoryOrder = ['custom', 'shared', 'notifications', 'integrations', 'deal-management', 'team', 'other'];
  const sortedCategories = Object.keys(templatesByCategory).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    const data: WorkflowData = {
      name: template.name,
      description: template.description,
      isActive: true,
      triggerType: template.triggerType,
      triggerConfig: { ...template.triggerConfig },
      actions: template.actions.map((action, idx) => ({
        ...action,
        id: `action-${Date.now()}-${idx}`,
      })),
    };
    
    // Increment usage count for custom templates
    if (template.isCustom) {
      incrementUsage.mutate(template.id);
    }
    
    onSelectTemplate(data);
    onOpenChange(false);
  };

  const handleDeleteTemplate = async () => {
    if (deletingTemplate) {
      await deleteTemplate.mutateAsync(deletingTemplate);
      setDeletingTemplate(null);
    }
  };

  const handleEditTemplate = (template: CustomWorkflowTemplate) => {
    setEditingTemplate(template);
  };

  const handleUpdateTemplate = async (data: EditTemplateData) => {
    if (!editingTemplate) return;
    setIsUpdating(true);
    try {
      await updateTemplate.mutateAsync({
        id: editingTemplate.id,
        name: data.name,
        description: data.description,
        category: data.category,
        tags: data.tags,
        is_shared: data.is_shared,
      });
      setEditingTemplate(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleExportAll = () => {
    const exportableTemplates = ownTemplates.map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      trigger_type: t.trigger_type,
      trigger_config: t.trigger_config,
      actions: t.actions,
      tags: t.tags,
    }));
    exportTemplates(exportableTemplates);
  };

  const handlePreviewAndUse = () => {
    if (previewTemplate) {
      handleSelectTemplate(previewTemplate);
      setPreviewTemplate(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Workflow Templates</DialogTitle>
                <DialogDescription>
                  Choose a pre-built template or use one of your saved templates
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setShowImportDialog(true)}
                >
                  <Upload className="h-3 w-3" />
                  Import
                </Button>
                {ownTemplates.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={handleExportAll}
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[50vh] pr-4">
            <div className="space-y-4">
              {sortedCategories.map((category) => {
                const templates = templatesByCategory[category];
                const config = CATEGORY_CONFIG[category] || { label: category, icon: <FileCode className="h-4 w-4" /> };
                const isExpanded = expandedCategories.includes(category);

                return (
                  <Collapsible
                    key={category}
                    open={isExpanded}
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-3 h-auto"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded ${category === 'custom' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                            {config.icon}
                          </div>
                          <span className="font-medium">{config.label}</span>
                          <Badge variant="secondary" className="ml-2">
                            {templates.length}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-2 space-y-2">
                      {category === 'custom' && templates.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          <Bookmark className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p>No saved templates yet.</p>
                          <p className="text-xs mt-1">Save a workflow as a template to see it here.</p>
                        </div>
                      )}
                      {templates.map(template => (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:border-primary/50 transition-colors group"
                          onClick={() => handleSelectTemplate(template)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg shrink-0 ${
                                template.category === 'shared' ? 'bg-blue-500/10 text-blue-600' :
                                template.isCustom ? 'bg-amber-500/10 text-amber-600' : 
                                'bg-primary/10 text-primary'
                              }`}>
                                {template.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <h4 className="font-medium truncate">{template.name}</h4>
                                    {template.isOwn && template.isShared && (
                                      <span title="Shared with team">
                                        <Share2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewTemplate(template);
                                      }}
                                      title="Preview template"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                    {template.isOwn && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const originalTemplate = customTemplates.find(t => t.id === template.id);
                                            if (originalTemplate) {
                                              handleEditTemplate(originalTemplate);
                                            }
                                          }}
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeletingTemplate(template.id);
                                          }}
                                        >
                                          <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                      </>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {TRIGGER_LABELS[template.triggerType]}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {template.description}
                                </p>
                                <div className="flex flex-wrap items-center gap-1 mt-2">
                                  {template.usageCount !== undefined && template.usageCount > 0 && (
                                    <Badge variant="outline" className="text-xs gap-1">
                                      <BarChart2 className="h-3 w-3" />
                                      {template.usageCount} {template.usageCount === 1 ? 'use' : 'uses'}
                                    </Badge>
                                  )}
                                  {template.tags.slice(0, 3).map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {template.actions.length > 1 && (
                                    <Badge variant="secondary" className="text-xs">
                                      {template.actions.length} actions
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {sortedCategories.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No templates found matching "{searchQuery}"</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTemplate} onOpenChange={() => setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Template Dialog */}
      {editingTemplate && (
        <EditTemplateDialog
          open={!!editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          onSave={handleUpdateTemplate}
          initialData={{
            id: editingTemplate.id,
            name: editingTemplate.name,
            description: editingTemplate.description || '',
            category: editingTemplate.category,
            tags: editingTemplate.tags,
            is_shared: editingTemplate.is_shared,
          }}
          isSaving={isUpdating}
        />
      )}

      {/* Template Preview Dialog */}
      <TemplatePreviewDialog
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
        onUseTemplate={handlePreviewAndUse}
        template={previewTemplate}
      />

      {/* Import Dialog */}
      <TemplateImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImportComplete={() => refetch()}
      />
    </>
  );
}

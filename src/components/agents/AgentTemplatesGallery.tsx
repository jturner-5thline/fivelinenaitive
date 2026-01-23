import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  Database, 
  Building2, 
  Activity, 
  Target, 
  Search,
  Zap,
  Clock
} from 'lucide-react';
import { useAgentTemplates, AgentTemplate } from '@/hooks/useAgentTemplates';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentTemplatesGalleryProps {
  onSelectTemplate: (template: AgentTemplate) => void;
}

export function AgentTemplatesGallery({ onSelectTemplate }: AgentTemplatesGalleryProps) {
  const { templates, featuredTemplates, templatesByCategory, isLoading, createAgentFromTemplate } = useAgentTemplates();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const categories = Object.keys(templatesByCategory);

  return (
    <div className="space-y-6">
      {/* Featured Templates */}
      {featuredTemplates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Featured Templates</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {featuredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={onSelectTemplate}
                onUse={() => createAgentFromTemplate.mutate(template)}
                isCreating={createAgentFromTemplate.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Templates by Category */}
      <Tabs defaultValue={categories[0]} className="w-full">
        <TabsList>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category} className="capitalize">
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
        {categories.map((category) => (
          <TabsContent key={category} value={category}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templatesByCategory[category].map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={onSelectTemplate}
                  onUse={() => createAgentFromTemplate.mutate(template)}
                  isCreating={createAgentFromTemplate.isPending}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface TemplateCardProps {
  template: AgentTemplate;
  onSelect: (template: AgentTemplate) => void;
  onUse: () => void;
  isCreating: boolean;
}

function TemplateCard({ template, onSelect, onUse, isCreating }: TemplateCardProps) {
  const capabilities = [
    { key: 'deals', enabled: template.can_access_deals, icon: Database, label: 'Deals' },
    { key: 'lenders', enabled: template.can_access_lenders, icon: Building2, label: 'Lenders' },
    { key: 'activities', enabled: template.can_access_activities, icon: Activity, label: 'Activities' },
    { key: 'milestones', enabled: template.can_access_milestones, icon: Target, label: 'Milestones' },
    { key: 'search', enabled: template.can_search_web, icon: Search, label: 'Web Search' },
  ].filter((c) => c.enabled);

  return (
    <div className="group rounded-lg bg-card/50 p-4 hover:bg-card transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
          {template.avatar_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold truncate">{template.name}</h4>
            {template.is_featured && (
              <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                <Sparkles className="h-3 w-3" />
                Featured
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {template.description}
          </p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-3">
        {capabilities.map((cap) => (
          <Badge key={cap.key} variant="outline" className="text-xs gap-1 border-border/50">
            <cap.icon className="h-3 w-3" />
            {cap.label}
          </Badge>
        ))}
      </div>

      {/* Suggested Triggers */}
      {template.suggested_triggers.length > 0 && (
        <div className="space-y-1 mb-3">
          <p className="text-xs text-muted-foreground font-medium">Suggested Triggers:</p>
          <div className="flex flex-wrap gap-1">
            {template.suggested_triggers.slice(0, 2).map((trigger, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs gap-1">
                {trigger.trigger_type === 'scheduled' ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                {trigger.trigger_type.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onSelect(template)}
        >
          Preview
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={onUse}
          disabled={isCreating}
        >
          Use Template
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-2">
        Used {template.usage_count} times
      </p>
    </div>
  );
}

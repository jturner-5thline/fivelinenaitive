import { Lightbulb, AlertTriangle, Target, Bell, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePreferences, SuggestionPreferences } from '@/contexts/PreferencesContext';

interface SuggestionSettingsProps {
  collapsible?: boolean;
  open?: boolean;
  onOpenChange?: () => void;
}

const suggestionOptions: Array<{
  key: keyof SuggestionPreferences;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
  iconColor: string;
}> = [
  {
    key: 'staleLenders',
    label: 'Stale lender warnings',
    description: "Alert when lenders haven't been updated recently",
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  {
    key: 'overdueMilestones',
    label: 'Overdue milestones',
    description: 'Show warnings for past-due milestones',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  {
    key: 'upcomingMilestones',
    label: 'Upcoming milestone reminders',
    description: 'Remind about milestones due today or tomorrow',
    icon: Bell,
    iconColor: 'text-purple-500',
  },
  {
    key: 'lendersWithoutNotes',
    label: 'Lenders without notes',
    description: 'Suggest adding notes to active lenders',
    icon: Target,
    iconColor: 'text-blue-500',
  },
  {
    key: 'stuckLenders',
    label: 'Stuck lenders',
    description: 'Alert when lenders are stuck in early stages',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  {
    key: 'staleDeals',
    label: 'Stale deal warnings',
    description: "Warn when deals haven't had recent activity",
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  {
    key: 'termSheetOpportunities',
    label: 'Term sheet opportunities',
    description: 'Highlight lenders at term sheet stage',
    icon: Lightbulb,
    iconColor: 'text-green-500',
  },
  {
    key: 'noMilestones',
    label: 'Missing milestones',
    description: 'Suggest adding milestones to deals without any',
    icon: Target,
    iconColor: 'text-blue-500',
  },
  {
    key: 'allMilestonesComplete',
    label: 'All milestones complete',
    description: 'Notify when all milestones are completed',
    icon: Lightbulb,
    iconColor: 'text-green-500',
  },
];

export function SuggestionSettings({ collapsible = false, open, onOpenChange }: SuggestionSettingsProps) {
  const { preferences, updatePreference } = usePreferences();

  const handleToggle = (key: keyof SuggestionPreferences, value: boolean) => {
    updatePreference('suggestions', {
      ...preferences.suggestions,
      [key]: value,
    });
  };

  const isOpen = open ?? true;

  const content = (
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which types of smart suggestions appear in the dashboard widget and on deal pages.
      </p>
      
      <div className="space-y-3">
        {suggestionOptions.map((option) => {
          const Icon = option.icon;
          return (
            <div key={option.key} className="flex items-center justify-between py-2">
              <Label htmlFor={option.key} className="flex items-start gap-3 cursor-pointer flex-1">
                <Icon className={`h-4 w-4 mt-0.5 ${option.iconColor}`} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {option.description}
                  </span>
                </div>
              </Label>
              <Switch
                id={option.key}
                checked={preferences.suggestions?.[option.key] ?? true}
                onCheckedChange={(checked) => handleToggle(option.key, checked)}
              />
            </div>
          );
        })}
      </div>
    </CardContent>
  );

  if (collapsible) {
    return (
      <Card>
        <Collapsible open={isOpen} onOpenChange={onOpenChange}>
          <CollapsibleTrigger className="w-full group">
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" />
                  <div className="text-left">
                    <CardTitle className="text-lg">Smart Suggestions</CardTitle>
                    <CardDescription>Customize which suggestions appear</CardDescription>
                  </div>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {content}
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          Smart Suggestions
        </CardTitle>
        <CardDescription>Customize which suggestions appear</CardDescription>
      </CardHeader>
      {content}
    </Card>
  );
}

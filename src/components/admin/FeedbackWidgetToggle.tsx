import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useFeatureFlags, useUpdateFeatureFlag, useCreateFeatureFlag } from '@/hooks/useFeatureFlags';
import { toast } from '@/hooks/use-toast';

const FLAG_NAME = 'feedback_widget';

export function FeedbackWidgetToggle() {
  const { data: flags, isLoading } = useFeatureFlags();
  const updateFlag = useUpdateFeatureFlag();
  const createFlag = useCreateFeatureFlag();

  const flag = flags?.find((f) => f.name === FLAG_NAME);
  const isEnabled = flag?.status === 'deployed' || flag?.status === 'staging';

  const handleToggle = async (checked: boolean) => {
    try {
      if (!flag) {
        // Create the flag if it doesn't exist
        await createFlag.mutateAsync({
          name: FLAG_NAME,
          description: 'Controls visibility of the feedback widget for users',
          status: checked ? 'deployed' : 'disabled',
        });
      } else {
        await updateFlag.mutateAsync({
          id: flag.id,
          status: checked ? 'deployed' : 'disabled',
        });
      }
      toast({
        title: `Feedback widget ${checked ? 'enabled' : 'disabled'}`,
        description: checked
          ? 'The feedback widget is now visible to users.'
          : 'The feedback widget is now hidden from users.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update feedback widget setting.',
        variant: 'destructive',
      });
    }
  };

  const isPending = updateFlag.isPending || createFlag.isPending;

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="feedback-toggle" className="text-sm text-muted-foreground">
        Widget {isEnabled ? 'On' : 'Off'}
      </Label>
      <Switch
        id="feedback-toggle"
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  );
}

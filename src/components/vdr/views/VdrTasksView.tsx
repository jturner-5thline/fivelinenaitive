import { toast } from 'sonner';

interface VdrTasksViewProps {
  dealId: string;
}

export function VdrTasksView({ dealId }: VdrTasksViewProps) {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <p className="text-xs text-muted-foreground">Tasks view — coming in next iteration</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Tasks view will be built in the next increment.
      </div>
    </div>
  );
}

import { toast } from 'sonner';

interface VdrIrlTrackerProps {
  dealId: string;
}

export function VdrIrlTracker({ dealId }: VdrIrlTrackerProps) {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Information Request List</h1>
        <p className="text-xs text-muted-foreground">IRL Tracker view — coming in next iteration</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        IRL Tracker will be built in the next increment.
      </div>
    </div>
  );
}

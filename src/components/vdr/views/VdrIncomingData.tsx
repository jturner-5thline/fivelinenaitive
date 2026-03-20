import { toast } from 'sonner';

interface VdrIncomingDataProps {
  dealId: string;
  vdrDocs: any;
  onPreview: (doc: any) => void;
}

export function VdrIncomingData({ dealId, vdrDocs, onPreview }: VdrIncomingDataProps) {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Incoming Data</h1>
        <p className="text-xs text-muted-foreground">Incoming Data view — coming in next iteration</p>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Incoming Data view will be built in the next increment.
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function formatTimeValue(value: number): string {
  // These values appear to be in milliseconds from the PDF
  // Converting to more readable format
  if (value < 60) return `${value}`;
  
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(0)}m`;
  
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  
  const days = hours / 24;
  return `${days.toFixed(0)}d`;
}

function formatLargeNumber(value: number): string {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

interface TimeInStageCardProps {
  stage: string;
  value: number;
}

function TimeInStageCard({ stage, value }: TimeInStageCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Time in Stage: {stage}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold font-mono">{formatLargeNumber(value)}</p>
      </CardContent>
    </Card>
  );
}

export function DealStageTimelineDashboard() {
  // Data from PDF - showing time in each stage
  const stageData = [
    { stage: 'NDA/Needs List Sent', value: 1084800000 },
    { stage: 'Lenders in Review', value: 2964960000 },
    { stage: 'Pre-Credit Needs', value: 644820779 },
    { stage: 'Terms Issued', value: 2979632432 },
    { stage: 'Initial Lender Review', value: 303124022 },
    { stage: 'In Due Diligence', value: 5633280000 },
    { stage: 'Initial Feedback', value: 55 },
    { stage: 'Submitted to Lenders', value: 385138983 },
    { stage: 'Analysis', value: 40 },
    { stage: 'Proposal in Development', value: 470731034 },
    { stage: 'Proposal Issued', value: 1263327731 },
    { stage: 'Agreement Pending', value: 1083475862 },
    { stage: 'Final Credit Items', value: 962235616 },
    { stage: 'Client Strategy Review', value: 31 },
    { stage: 'Write-Up Pending', value: 217053659 },
  ];

  return (
    <div className="space-y-6">
      {/* Grid of time-in-stage cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {stageData.map((item) => (
          <TimeInStageCard 
            key={item.stage} 
            stage={item.stage} 
            value={item.value} 
          />
        ))}
      </div>
    </div>
  );
}

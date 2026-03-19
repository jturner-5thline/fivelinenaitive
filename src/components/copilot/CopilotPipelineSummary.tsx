interface PipelineData {
  total: number;
  active: number;
  totalValue: number;
  byStage: Record<string, number>;
  scope?: string;
}

interface Props {
  data: PipelineData;
}

const stageColors: Record<string, string> = {
  'pipeline': 'rgb(156, 163, 175)',
  'active': 'rgb(59, 130, 246)',
  'due diligence': 'rgb(245, 158, 11)',
  'term sheet': 'rgb(168, 85, 247)',
  'funded': 'rgb(34, 197, 94)',
  'closed won': 'rgb(34, 197, 94)',
  'closed lost': 'rgb(239, 68, 68)',
};

export function CopilotPipelineSummary({ data }: Props) {
  const avgDealSize = data.total > 0 ? data.totalValue / data.total : 0;
  const staleCount = data.byStage['Stale'] || 0;

  // Sort stages by count for the bar chart
  const sortedStages = Object.entries(data.byStage)
    .filter(([stage]) => stage !== 'Stale' && stage !== 'Unknown')
    .sort(([,a], [,b]) => b - a);

  const maxCount = Math.max(...sortedStages.map(([,count]) => count));

  return (
    <div
      style={{
        background: 'var(--glass-surface)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '16px',
        marginTop: 8,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>
        Pipeline Summary
      </h3>

      {/* Stage Bar Chart */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 6 }}>
          Deals by Stage
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sortedStages.map(([stage, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const stageColor = stageColors[stage.toLowerCase()] || 'rgb(156, 163, 175)';
            
            return (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 80, fontSize: 11, color: 'hsl(var(--muted-foreground))', textAlign: 'right' }}>
                  {stage}
                </div>
                <div 
                  style={{
                    flex: 1,
                    height: 16,
                    background: 'rgba(156, 163, 175, 0.1)',
                    borderRadius: 8,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percentage}%`,
                      height: '100%',
                      background: stageColor,
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
                <div style={{ width: 24, fontSize: 11, color: 'var(--foreground)', fontWeight: 500 }}>
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--glass-border)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            Total Pipeline Value
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace' }}>
            ${data.totalValue.toLocaleString()}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            Active Deals
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)' }}>
            {data.active}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            Avg Deal Size
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace' }}>
            ${avgDealSize.toLocaleString()}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
            Stale Deals
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: staleCount > 0 ? 'rgb(245, 158, 11)' : 'var(--foreground)' }}>
            {staleCount}
          </div>
        </div>
      </div>
    </div>
  );
}
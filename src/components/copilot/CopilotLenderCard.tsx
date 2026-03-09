import { formatDistanceToNow } from 'date-fns';

interface Lender {
  id?: string;
  name: string;
  stage?: string;
  notes?: string;
  tracking_status?: string;
  created_at?: string;
}

interface Props {
  lender: Lender;
  onNavigate?: () => void;
}

const stageColors: Record<string, string> = {
  'on deck': 'rgb(156, 163, 175)',
  'active': 'rgb(59, 130, 246)',
  'reviewing': 'rgb(245, 158, 11)', 
  'term sheet': 'rgb(168, 85, 247)',
  'funded': 'rgb(34, 197, 94)',
  'passed': 'rgb(239, 68, 68)',
};

export function CopilotLenderCard({ lender, onNavigate }: Props) {
  const handleLenderClick = () => {
    // Navigate to lenders page with search
    const newPath = `/lenders?search=${encodeURIComponent(lender.name)}`;
    window.history.pushState({}, '', newPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onNavigate?.();
  };

  const stageColor = stageColors[lender.stage?.toLowerCase() || ''] || 'rgb(156, 163, 175)';
  const lastInteraction = lender.created_at 
    ? formatDistanceToNow(new Date(lender.created_at), { addSuffix: true })
    : 'Unknown';

  const truncateNotes = (notes?: string) => {
    if (!notes) return '';
    const lines = notes.split('\n').slice(0, 2);
    if (lines.length === 2 && notes.split('\n').length > 2) {
      return lines.join('\n') + '...';
    }
    return lines.join('\n');
  };

  return (
    <div
      style={{
        background: 'var(--glass-surface)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '12px 14px',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={handleLenderClick}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--foreground)',
            textAlign: 'left',
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationColor: 'transparent',
            transition: 'text-decoration-color 150ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = 'hsl(var(--primary))')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = 'transparent')}
        >
          {lender.name}
        </button>
        {lender.stage && (
          <div
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              color: 'white',
              background: stageColor,
            }}
          >
            {lender.stage}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 6, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
        Last interaction: {lastInteraction}
      </div>

      {lender.notes && (
        <div
          style={{
            fontSize: 12,
            color: 'hsl(var(--muted-foreground))',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {truncateNotes(lender.notes)}
        </div>
      )}
    </div>
  );
}
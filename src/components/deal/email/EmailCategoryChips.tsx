// Renders color-coded category chips (Clients & Deals = green, Asana = light red,
// Calendar = teal) for an email row. Uses the shared classifier so chips match
// the sub-tab filtering in both the Inbox dialog and Niki's Daily Briefing.
import { Badge } from '@/components/ui/badge';
import { classifyEmail, type EmailCategory } from '@/utils/emailClassifier';
import { useEmailClassifierData } from '@/hooks/useEmailClassifierData';
import { cn } from '@/lib/utils';

interface CategoryStyle {
  label: string;
  className: string;
}

const CATEGORY_STYLES: Record<EmailCategory, CategoryStyle> = {
  clients_deals: {
    label: 'Clients & Deals',
    className:
      'bg-[hsl(var(--email-cat-clients)/0.15)] text-[hsl(var(--email-cat-clients))] border-[hsl(var(--email-cat-clients)/0.35)]',
  },
  asana_projects: {
    label: 'Asana',
    className:
      'bg-[hsl(var(--email-cat-asana)/0.15)] text-[hsl(var(--email-cat-asana))] border-[hsl(var(--email-cat-asana)/0.35)]',
  },
  calendar: {
    label: 'Calendar',
    className:
      'bg-[hsl(var(--email-cat-calendar)/0.15)] text-[hsl(var(--email-cat-calendar))] border-[hsl(var(--email-cat-calendar)/0.35)]',
  },
};

interface EmailCategoryChipsProps {
  email: Record<string, any>;
  className?: string;
}

export function EmailCategoryChips({ email, className }: EmailCategoryChipsProps) {
  const { entities, orgCtx } = useEmailClassifierData();
  const cats = classifyEmail(email, entities, orgCtx);
  if (cats.length === 0) return null;
  return (
    <>
      {cats.map((cat) => {
        const style = CATEGORY_STYLES[cat];
        return (
          <Badge
            key={cat}
            variant="outline"
            className={cn(
              'text-[9px] h-[16px] px-1 gap-0.5 shrink-0 font-medium',
              style.className,
              className,
            )}
          >
            {style.label}
          </Badge>
        );
      })}
    </>
  );
}
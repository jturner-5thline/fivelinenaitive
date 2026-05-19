/**
 * Self-contained launcher for the "Draft Email to Client Contact" popup.
 * Owns dialog open-state and lazy-loads the heavy composer dialog so the
 * deal detail view stays snappy.
 */
import { Suspense, lazy, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

const DraftEmailToClientContactDialog = lazy(() =>
  import('./email/DraftEmailToClientContactDialog').then(m => ({
    default: m.DraftEmailToClientContactDialog,
  })),
);

interface DraftEmailToClientContactButtonProps {
  dealId?: string | null;
  dealName?: string | null;
  contactName?: string | null;
  /** Free-form contactInfo (may be email or "Name <email@x.com>" or phone). */
  contactInfo?: string | null;
  /** Optional company URL/domain used to broaden thread search. */
  companyDomain?: string | null;
  className?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/i;

export function DraftEmailToClientContactButton({
  dealId,
  dealName,
  contactName,
  contactInfo,
  companyDomain,
  className,
  size = 'sm',
  variant = 'outline',
}: DraftEmailToClientContactButtonProps) {
  const [open, setOpen] = useState(false);
  const contactEmail = contactInfo?.match(EMAIL_RE)?.[0]
    ?? contactName?.match(EMAIL_RE)?.[0]
    ?? null;
  const disabled = !contactEmail;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn('h-8 gap-1.5 text-xs', className)}
        title={disabled ? 'Add a contact email to enable drafting' : 'Draft an email to this contact'}
      >
        <Mail className="h-3.5 w-3.5" />
        Draft Email to Client Contact
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DraftEmailToClientContactDialog
            open={open}
            onOpenChange={setOpen}
            dealId={dealId}
            dealName={dealName}
            contactName={contactName}
            contactEmail={contactEmail}
            companyDomain={companyDomain}
          />
        </Suspense>
      )}
    </>
  );
}

export default DraftEmailToClientContactButton;
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
  /** Visible button label. Defaults to "Draft Email to Client Contact". */
  label?: string;
  /** Render as a compact icon-only button (envelope only). */
  iconOnly?: boolean;
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
  label = 'Draft Email to Client Contact',
  iconOnly = false,
}: DraftEmailToClientContactButtonProps) {
  const [open, setOpen] = useState(false);
  const contactEmail = contactInfo?.match(EMAIL_RE)?.[0]
    ?? contactName?.match(EMAIL_RE)?.[0]
    ?? null;
  const disabled = !contactEmail;

  const tooltipText = disabled
    ? 'Add a contact email to enable drafting'
    : label;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? 'icon' : size}
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={tooltipText}
        className={cn(
          iconOnly ? 'h-8 w-8 p-0' : 'h-8 gap-1.5 text-xs',
          className,
        )}
      >
        <Mail className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
        {!iconOnly && label}
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
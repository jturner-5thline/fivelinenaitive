import { useMemo } from 'react';
import { Building2, Mail, Phone, User, Briefcase, ThumbsDown, Clock, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDealsContext } from '@/contexts/DealsContext';

interface LenderInfo {
  name: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  preferences: string[];
}

interface LenderDetailDialogProps {
  lender: LenderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LenderDetailDialog({ lender, open, onOpenChange }: LenderDetailDialogProps) {
  const { deals } = useDealsContext();

  // Find all deals where this lender is involved
  const lenderDeals = useMemo(() => {
    if (!lender) return { active: [], sent: [], passReasons: [] };

    const active: { dealName: string; company: string; stage: string; status: string }[] = [];
    const sent: { dealName: string; company: string; stage: string; dateSent: string }[] = [];
    const passReasons: { dealName: string; company: string; reason: string }[] = [];

    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender) {
        // Check if passed
        if (dealLender.trackingStatus === 'passed' && dealLender.passReason) {
          passReasons.push({
            dealName: deal.name,
            company: deal.company,
            reason: dealLender.passReason,
          });
        } else if (dealLender.trackingStatus === 'active') {
          active.push({
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            status: dealLender.trackingStatus,
          });
        } else {
          // All other deals sent to this lender
          sent.push({
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            dateSent: dealLender.updatedAt || deal.createdAt,
          });
        }
      }
    });

    return { active, sent, passReasons };
  }, [lender, deals]);

  if (!lender) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6" />
            {lender.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)] pr-4">
          <div className="space-y-6">
            {/* Contact Information */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Contact Information
              </h3>
              <div className="grid gap-3">
                {lender.contact.name && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{lender.contact.name}</span>
                  </div>
                )}
                {lender.contact.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lender.contact.email}`} className="text-primary hover:underline">
                      {lender.contact.email}
                    </a>
                  </div>
                )}
                {lender.contact.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lender.contact.phone}`} className="hover:underline">
                      {lender.contact.phone}
                    </a>
                  </div>
                )}
                {!lender.contact.name && !lender.contact.email && !lender.contact.phone && (
                  <p className="text-muted-foreground text-sm">No contact information available</p>
                )}
              </div>
            </section>

            <Separator />

            {/* Deal Preferences */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Deal Preferences
              </h3>
              {lender.preferences.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {lender.preferences.map((pref, idx) => (
                    <Badge key={idx} variant="secondary">
                      {pref}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No preferences specified</p>
              )}
            </section>

            <Separator />

            {/* Active Deals */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Active Deals ({lenderDeals.active.length})
              </h3>
              {lenderDeals.active.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.active.map((deal, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-sm text-muted-foreground">{deal.dealName}</p>
                      </div>
                      <Badge variant="outline">{deal.stage}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No active deals with this lender</p>
              )}
            </section>

            <Separator />

            {/* Deals Sent */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Deals Sent ({lenderDeals.sent.length})
              </h3>
              {lenderDeals.sent.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.sent.map((deal, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-sm text-muted-foreground">{deal.dealName}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{deal.stage}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No deals have been sent to this lender</p>
              )}
            </section>

            <Separator />

            {/* Pass Reasons */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <ThumbsDown className="h-4 w-4 text-destructive" />
                Pass Reasons ({lenderDeals.passReasons.length})
              </h3>
              {lenderDeals.passReasons.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.passReasons.map((item, idx) => (
                    <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{item.company}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.dealName}</p>
                      <p className="text-sm mt-2 text-destructive/80">Reason: {item.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No pass history with this lender</p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

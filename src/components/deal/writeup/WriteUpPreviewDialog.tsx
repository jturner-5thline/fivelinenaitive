import { Eye, ExternalLink, Linkedin, Building2, MapPin, Calendar, Users, Globe, DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DealWriteUpData } from '../DealWriteUp';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';
import { cn } from '@/lib/utils';

interface WriteUpPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DealWriteUpData;
  owners: Array<{ owner_name: string; ownership_percentage: number; owner_url?: string | null }>;
  totalEquityRaised: string;
}

function formatCurrency(value: string): string {
  if (!value) return '—';
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return value;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function getGridCols(count: number) {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase">{children}</h3>
      <Separator className="flex-1" />
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  if (!value || value === '—') return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <span className="text-muted-foreground">{label}</span>
        <p className="font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function WriteUpPreviewDialog({ open, onOpenChange, data, owners, totalEquityRaised }: WriteUpPreviewDialogProps) {
  const dealTypeLabels = dealTypeIdsToLabels(data.dealTypes);
  const filteredTeam = (data.team || []).filter(m => m.name.trim());
  const filteredKeyItems = data.keyItems.filter(i => i.title.trim());
  const filteredHighlights = data.companyHighlights.filter(i => i.title.trim());

  // Check if any financial year has growth/change columns
  const hasRevGrowth = data.financialYears.some(fy => (fy as any).rev_growth);
  const hasGmChange = data.financialYears.some(fy => (fy as any).gross_margin_change);
  const hasEbitdaChange = data.financialYears.some(fy => (fy as any).ebitda_change);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-primary" />
            Write-Up Preview
          </DialogTitle>
          <DialogDescription className="text-xs">
            Preview of how this deal write-up will appear on FLEx.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[70vh]">
          <div className="px-6 pb-6 space-y-6">

            {/* Header Badges */}
            <div className="flex flex-wrap gap-2">
              {data.industries.map((ind) => (
                <Badge key={ind} variant="secondary" className="text-xs">{ind}</Badge>
              ))}
              {data.location && <Badge variant="outline" className="text-xs">{data.location}</Badge>}
              {dealTypeLabels.map((dt) => (
                <Badge key={dt} variant="outline" className="text-xs border-primary/30 text-primary">{dt}</Badge>
              ))}
            </div>

            {/* Deal Overview */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-xl font-bold text-foreground">
                  {data.publishAsAnonymous ? 'Anonymous Company' : (data.companyName || 'Untitled Company')}
                </h2>
                {data.capitalAsk && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0 text-sm font-semibold px-3">
                    {formatCurrency(data.capitalAsk)}
                  </Badge>
                )}
              </div>
              {data.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{data.description}</p>
              )}
              {data.useOfFunds && (
                <div className="mt-3 rounded-md border bg-muted/30 p-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Use of Funds</span>
                  <p className="text-sm text-foreground mt-1">{data.useOfFunds}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Transaction Highlights (Key Items) */}
            {filteredKeyItems.length > 0 && (
              <div>
                <SectionHeader>Transaction Highlights</SectionHeader>
                <div className={cn('grid gap-3', getGridCols(filteredKeyItems.length))}>
                  {filteredKeyItems.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company Overview Grid */}
            <div>
              <SectionHeader>Company Overview</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <InfoChip icon={Building2} label="Customer Base" value={data.billingModels.length > 0 ? data.billingModels.join(', ') : '—'} />
                <InfoChip icon={MapPin} label="Location" value={data.location || '—'} />
                <InfoChip label="Industry" value={data.industries.join(', ') || '—'} />
                <InfoChip label="Billing Model" value={data.billingModels.join(', ') || '—'} />
                <InfoChip label="Profitability" value={data.profitability || '—'} />
                <InfoChip icon={Calendar} label="Year Founded" value={data.yearFounded || '—'} />
                <InfoChip icon={Users} label="Headcount" value={data.headcount || '—'} />
                <InfoChip label="Accounting System" value={data.accountingSystem || '—'} />
                {data.companyUrl && (
                  <div className="flex items-start gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-muted-foreground">Website</span>
                      <p className="font-medium text-primary truncate max-w-[180px]">{data.companyUrl}</p>
                    </div>
                  </div>
                )}
                {data.linkedinUrl && (
                  <div className="flex items-start gap-2 text-sm">
                    <Linkedin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-muted-foreground">LinkedIn</span>
                      <p className="font-medium text-primary truncate max-w-[180px]">{data.linkedinUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Team Cards */}
            {filteredTeam.length > 0 && (
              <div>
                <SectionHeader>Team</SectionHeader>
                <div className={cn('grid gap-3', getGridCols(filteredTeam.length))}>
                  {filteredTeam.map((member) => (
                    <div key={member.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{member.name}</p>
                        {member.title && <p className="text-xs text-muted-foreground">{member.title}</p>}
                        {member.linkedin && (
                          <p className="text-xs text-primary truncate">{member.linkedin}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company Highlights */}
            {filteredHighlights.length > 0 && (
              <div>
                <SectionHeader>Company Highlights</SectionHeader>
                <div className={cn('grid gap-3', getGridCols(filteredHighlights.length))}>
                  {filteredHighlights.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financials Table */}
            {data.financialYears.length > 0 && (
              <div>
                <SectionHeader>Financials</SectionHeader>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2.5 font-medium text-muted-foreground">Year</th>
                        <th className="text-right p-2.5 font-medium text-muted-foreground">Revenue</th>
                        {hasRevGrowth && <th className="text-right p-2.5 font-medium text-muted-foreground">Rev Growth</th>}
                        <th className="text-right p-2.5 font-medium text-muted-foreground">Gross Margin</th>
                        {hasGmChange && <th className="text-right p-2.5 font-medium text-muted-foreground">GM Δ</th>}
                        <th className="text-right p-2.5 font-medium text-muted-foreground">EBITDA</th>
                        {hasEbitdaChange && <th className="text-right p-2.5 font-medium text-muted-foreground">EBITDA Δ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.financialYears.map((fy) => {
                        const fyAny = fy as any;
                        const ebitdaValue = fy.ebitda?.replace(/[^0-9.-]/g, '');
                        const isNegativeEbitda = ebitdaValue && parseFloat(ebitdaValue) < 0;
                        return (
                          <tr key={fy.id} className="border-b last:border-b-0">
                            <td className="p-2.5 font-medium text-foreground">{fy.year}</td>
                            <td className="p-2.5 text-right text-foreground">{fy.revenue || '—'}</td>
                            {hasRevGrowth && <td className="p-2.5 text-right text-primary">{fyAny.rev_growth || '—'}</td>}
                            <td className="p-2.5 text-right text-foreground">{fy.gross_margin || '—'}</td>
                            {hasGmChange && <td className="p-2.5 text-right text-muted-foreground">{fyAny.gross_margin_change || '—'}</td>}
                            <td className={cn('p-2.5 text-right', isNegativeEbitda ? 'text-destructive' : 'text-foreground')}>{fy.ebitda || '—'}</td>
                            {hasEbitdaChange && <td className="p-2.5 text-right text-muted-foreground">{fyAny.ebitda_change || '—'}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Financial Commentary */}
            {data.financialComments.length > 0 && (
              <div>
                <SectionHeader>Financial Commentary</SectionHeader>
                <div className="space-y-2">
                  {data.financialComments.map((fc) => (
                    <div key={fc.id} className="rounded-md border bg-muted/30 p-3">
                      {fc.title && <h4 className="text-sm font-semibold text-foreground">{fc.title}</h4>}
                      {fc.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{fc.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing Debt */}
            {data.existingDebtDetails && (
              <div>
                <SectionHeader>Existing Debt</SectionHeader>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm text-foreground leading-relaxed">{data.existingDebtDetails}</p>
                </div>
              </div>
            )}

            {/* Ownership & Equity */}
            {(owners.length > 0 || totalEquityRaised) && (
              <div>
                <SectionHeader>Ownership & Equity</SectionHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {owners.length > 0 && (
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2.5 font-medium text-muted-foreground">Owner</th>
                            <th className="text-right p-2.5 font-medium text-muted-foreground">Ownership</th>
                          </tr>
                        </thead>
                        <tbody>
                          {owners.map((owner, i) => (
                            <tr key={i} className="border-b last:border-b-0">
                              <td className="p-2.5 text-foreground">
                                {owner.owner_url ? (
                                  <a href={owner.owner_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {owner.owner_name}
                                  </a>
                                ) : owner.owner_name}
                              </td>
                              <td className="p-2.5 text-right font-medium text-foreground">{owner.ownership_percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {totalEquityRaised && (
                    <div className="rounded-lg border bg-card p-4 flex flex-col justify-center">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Equity Raised</span>
                      <span className="text-xl font-bold text-foreground mt-1">{totalEquityRaised}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t">
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useMemo, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Eye, Target, Shield, Building2, Users, TrendingUp, PieChart as PieChartIcon,
  ExternalLink, Linkedin, Globe, Download, Loader2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DealWriteUpData } from '../DealWriteUp';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine, LabelList,
} from 'recharts';

/* ── Manrope font (injected once) ── */
const MANROPE_LINK = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
if (typeof document !== 'undefined' && !document.querySelector(`link[href*="Manrope"]`)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MANROPE_LINK;
  document.head.appendChild(link);
}

/* ── Design tokens ── */
const T = {
  bg: 'hsl(40,20%,98%)',
  fg: 'hsl(222,47%,11%)',
  cardBg: 'hsl(0,0%,100%)',
  cardBorder: 'hsl(220,13%,87%)',
  primary: 'hsl(243,75%,35%)',
  primary10: 'hsla(243,75%,35%,0.1)',
  primary20: 'hsla(243,75%,35%,0.2)',
  mutedFg: 'hsl(220,9%,46%)',
  secondaryBg: 'hsl(40,33%,96%)',
  secondaryBg50: 'hsla(40,33%,96%,0.5)',
  green: '#22c55e',
  emerald600: '#059669',
  red600: '#dc2626',
  radius: '8px',
  font: "'Manrope', system-ui, sans-serif",
} as const;

const CHART_COLORS = [
  'hsl(243,75%,45%)', 'hsl(160,60%,45%)', 'hsl(35,91%,55%)', 'hsl(340,75%,55%)',
  'hsl(200,80%,50%)', 'hsl(280,65%,55%)', 'hsl(20,85%,55%)', 'hsl(175,70%,40%)',
];

/* ── Props ── */
interface WriteUpPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DealWriteUpData;
  owners: Array<{ owner_name: string; ownership_percentage: number; owner_url?: string | null }>;
  totalEquityRaised: string;
  dealManager?: string;
}

/* ── Helpers ── */
function fmtCurrency(value: string | undefined): string {
  if (!value) return '—';
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return value;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}MM`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parsePct(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

/* ── Reusable sub-components ── */
const Card: React.FC<{ children: React.ReactNode; className?: string; hover?: boolean; 'data-pdf-section'?: boolean }> = ({ children, className = '', hover, ...rest }) => (
  <div
    style={{
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: T.radius,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      transition: hover ? 'transform 0.2s, box-shadow 0.2s' : undefined,
      fontFamily: T.font,
    }}
    className={className}
    {...rest}
    onMouseEnter={hover ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; } : undefined}
    onMouseLeave={hover ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; } : undefined}
  >
    {children}
  </div>
);

const CardHeader: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {icon}
      <span style={{ fontSize: 20, fontWeight: 600, color: T.fg, fontFamily: T.font }}>{title}</span>
    </div>
    {right}
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; variant?: 'primary' | 'outline' | 'secondary' | 'primaryLarge' }> = ({ children, variant = 'primary' }) => {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', borderRadius: T.radius,
    fontSize: 12, fontWeight: 600, fontFamily: T.font,
  };
  const styles: Record<string, React.CSSProperties> = {
    primary: { ...base, background: T.primary10, color: T.primary, border: `1px solid ${T.primary20}`, padding: '4px 12px' },
    outline: { ...base, background: T.cardBg, border: `1px solid ${T.cardBorder}`, color: T.fg, padding: '4px 12px' },
    secondary: { ...base, background: T.secondaryBg, color: T.fg, padding: '4px 12px', border: 'none' },
    primaryLarge: { ...base, background: T.primary10, color: T.primary, border: `1px solid ${T.primary20}`, padding: '12px 24px', fontSize: 24 },
  };
  return <span style={styles[variant]}>{children}</span>;
};

const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <span style={{ fontSize: 14, fontWeight: 600, color: T.fg, fontFamily: T.font, whiteSpace: 'nowrap' }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: T.cardBorder }} />
  </div>
);

/* ── Main component ── */
export function WriteUpPreviewDialog({ open, onOpenChange, data, owners, totalEquityRaised, dealManager }: WriteUpPreviewDialogProps) {
  const dealTypeLabels = dealTypeIdsToLabels(data.dealTypes);
  const filteredTeam = (data.team || []).filter(m => m.name.trim());
  const filteredKeyItems = (data.keyItems || []).filter(i => i.title?.trim());
  const filteredHighlights = data.companyHighlights.filter(i => i.title.trim());
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!contentRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const el = contentRef.current;
      const scrollParent = el.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      const prevOverflow = scrollParent?.style.overflow;
      const prevMaxHeight = scrollParent?.style.maxHeight;
      if (scrollParent) {
        scrollParent.style.overflow = 'visible';
        scrollParent.style.maxHeight = 'none';
      }

      // A4 dimensions in mm
      const A4_W = 210;
      const A4_H = 297;
      const MARGIN = 12;
      const CONTENT_W = A4_W - MARGIN * 2;
      const GAP = 3;

      // Find all sections marked with data-pdf-section, or fall back to direct children
      let sections = Array.from(el.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
      if (sections.length === 0) {
        sections = Array.from(el.children) as HTMLElement[];
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let currentY = MARGIN;
      let isFirstSection = true;

      for (const section of sections) {
        // Skip invisible/empty sections
        if (section.offsetHeight === 0) continue;

        const DPI_SCALE = 3;
        const canvas = await html2canvas(section, {
          scale: DPI_SCALE,
          useCORS: true,
          backgroundColor: T.bg,
          logging: false,
        });

        const scaleFactor = CONTENT_W / (canvas.width / DPI_SCALE);
        const sectionH = (canvas.height / DPI_SCALE) * scaleFactor;

        // If this section won't fit on the current page, start a new one
        const remaining = A4_H - MARGIN - currentY;
        if (sectionH > remaining && !isFirstSection) {
          pdf.addPage();
          currentY = MARGIN;
        }

        // If a single section is taller than a full page, tile it across pages
        if (sectionH > A4_H - MARGIN * 2) {
          const imgData = canvas.toDataURL('image/png');
          const fullImgH = sectionH;
          let yOff = 0;
          while (yOff < fullImgH) {
            if (yOff > 0) {
              pdf.addPage();
              currentY = MARGIN;
            }
            pdf.addImage(imgData, 'PNG', MARGIN, currentY - yOff, CONTENT_W, fullImgH);
            yOff += A4_H - MARGIN * 2;
          }
          currentY = MARGIN + (fullImgH % (A4_H - MARGIN * 2)) + GAP;
        } else {
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', MARGIN, currentY, CONTENT_W, sectionH);
          currentY += sectionH + GAP;
        }

        isFirstSection = false;
      }

      if (scrollParent) {
        scrollParent.style.overflow = prevOverflow || '';
        scrollParent.style.maxHeight = prevMaxHeight || '';
      }

      const name = data.publishAsAnonymous ? 'Anonymous' : (data.companyName || 'Deal');
      pdf.save(`${name.replace(/[^a-zA-Z0-9]/g, '_')}_WriteUp.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [data.companyName, data.publishAsAnonymous, isExporting]);

  // Parse financial data for charts
  const chartData = useMemo(() => {
    return data.financialYears.map(fy => {
      const rev = parseNum(fy.revenue);
      const ebitda = parseNum(fy.ebitda);
      const gm = parsePct(fy.gross_margin);
      return { year: fy.year, revenue: rev, ebitda, grossMargin: gm };
    }).filter(d => d.year);
  }, [data.financialYears]);

  // Compute margins and YoY changes
  const marginData = useMemo(() => {
    return chartData.map((d, i) => {
      const gmPct = d.grossMargin;
      const ebitdaMargin = (d.revenue && d.ebitda) ? (d.ebitda / d.revenue) * 100 : null;
      const prev = i > 0 ? chartData[i - 1] : null;
      const gmChange = (gmPct !== null && prev?.grossMargin !== null && prev?.grossMargin !== undefined)
        ? gmPct - prev.grossMargin : null;
      const prevEbitdaMargin = (prev?.revenue && prev?.ebitda) ? (prev.ebitda / prev.revenue) * 100 : null;
      const ebitdaMarginChange = (ebitdaMargin !== null && prevEbitdaMargin !== null)
        ? ebitdaMargin - prevEbitdaMargin : null;
      return { year: d.year, grossMargin: gmPct, ebitdaMargin, gmChange, ebitdaMarginChange };
    });
  }, [chartData]);

  const hasChartData = chartData.length >= 2;
  const hasRevGrowth = data.financialYears.some(fy => (fy as any).rev_growth);
  const hasGmChange = data.financialYears.some(fy => (fy as any).gross_margin_change);
  const hasEbitdaChange = data.financialYears.some(fy => (fy as any).ebitda_change);

  // Donut chart state
  const [activeOwnerIdx, setActiveOwnerIdx] = useState<number | null>(null);

  const companyName = data.publishAsAnonymous ? 'Anonymous Company' : (data.companyName || 'Untitled Company');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col" style={{ fontFamily: T.font }}>
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: T.font }}>
              <Eye className="h-5 w-5" style={{ color: T.primary }} />
              Write-Up Preview
            </DialogTitle>
            <button onClick={handleDownloadPdf} disabled={isExporting}
              style={{
                padding: '6px 16px', fontSize: 13, fontWeight: 500, borderRadius: T.radius,
                border: `1px solid ${T.primary}`, background: T.primary, color: '#ffffff', cursor: isExporting ? 'not-allowed' : 'pointer',
                fontFamily: T.font, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: isExporting ? 0.6 : 1, marginRight: 24,
              }}>
              {isExporting ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 14, height: 14 }} />}
              {isExporting ? 'Exporting…' : 'Download PDF'}
            </button>
          </div>
          <DialogDescription className="text-xs">
            Preview of how this deal write-up will appear on FLEx.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div ref={contentRef} style={{ maxWidth: 896, margin: '0 auto', padding: '32px 24px', background: T.bg, fontFamily: T.font }}>

            {/* ── 1. Header Area ── */}
            <div data-pdf-section style={{ marginBottom: 28 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: T.mutedFg, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DEAL WRITE-UP
              </span>
              <h1 style={{ fontSize: 30, fontWeight: 700, color: T.fg, margin: '4px 0 12px', fontFamily: T.font }}>
                {companyName}
              </h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.industries.map(ind => <Badge key={ind} variant="primary">{ind}</Badge>)}
                {data.location && <Badge variant="outline">{data.location}</Badge>}
                {dealTypeLabels.map(dt => <Badge key={dt} variant="secondary">{dt}</Badge>)}
              </div>
            </div>

            {/* ── 2. Deal Overview Card ── */}
            <Card data-pdf-section className="mb-6">
              <CardHeader
                icon={<Target style={{ width: 20, height: 20, color: T.primary }} />}
                title="Deal Overview"
                right={data.capitalAsk ? <Badge variant="primaryLarge">{fmtCurrency(data.capitalAsk)}</Badge> : undefined}
              />
              <div style={{ padding: '16px 24px 24px' }}>
                {data.description && (
                  <p style={{ fontSize: 16, lineHeight: 1.625, color: T.mutedFg, margin: '0 0 20px' }}>{data.description}</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Deal Type</span>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {dealTypeLabels.length > 0
                        ? dealTypeLabels.map(dt => (
                            <span key={dt} style={{
                              background: T.secondaryBg, color: T.fg, fontSize: 16, fontWeight: 600,
                              padding: '8px 16px', borderRadius: T.radius, fontFamily: T.font,
                            }}>{dt}</span>
                          ))
                        : <span style={{ color: T.mutedFg }}>—</span>
                      }
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Use of Proceeds</span>
                    <p style={{ fontSize: 14, color: T.mutedFg, marginTop: 6 }}>{data.useOfFunds || '—'}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* ── 3. Transaction Highlights ── */}
            {filteredKeyItems.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<Shield style={{ width: 20, height: 20, color: T.primary }} />} title="Transaction Highlights" />
                <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {filteredKeyItems.map(item => (
                    <div key={item.id} style={{
                      padding: 16, borderRadius: T.radius, background: T.secondaryBg50,
                      border: `1px solid ${T.cardBorder}`,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>{item.title}</div>
                      {item.description && (
                        <p style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6, marginTop: 4 }}>{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── 4. Company Overview ── */}
            <Card data-pdf-section className="mb-6">
              <CardHeader icon={<Building2 style={{ width: 20, height: 20, color: T.primary }} />} title="Company Overview" />
              <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                {[
                  { label: 'Customer Base', value: data.billingModels.length > 0 ? data.billingModels.join(', ') : null },
                  { label: 'Headquarters', value: data.location },
                  { label: 'Industry', value: data.industries.join(', ') },
                  { label: 'Year Founded', value: data.yearFounded },
                  { label: 'Headcount', value: data.headcount },
                  { label: 'Business Model', value: data.billingModels.join(', ') },
                  { label: 'Profitability', value: data.profitability },
                  { label: 'Accounting System', value: data.accountingSystem },
                ].filter(f => f.value).map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>{f.label}</div>
                    <div style={{ fontSize: 16, color: T.mutedFg, marginTop: 2 }}>{f.value}</div>
                  </div>
                ))}
                {data.companyUrl && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Company Website</div>
                    <a href={data.companyUrl.startsWith('http') ? data.companyUrl : `https://${data.companyUrl}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 16, color: T.primary, textDecoration: 'none', marginTop: 2, display: 'block' }}>
                      {data.companyUrl} <ExternalLink style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle' }} />
                    </a>
                  </div>
                )}
                {dealManager && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Deal Manager</div>
                    <div style={{ fontSize: 16, color: T.mutedFg, marginTop: 2 }}>{dealManager}</div>
                  </div>
                )}
                {data.linkedinUrl && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>LinkedIn</div>
                    <a href={data.linkedinUrl.startsWith('http') ? data.linkedinUrl : `https://${data.linkedinUrl}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 16, color: T.primary, textDecoration: 'none', marginTop: 2, display: 'block' }}>
                      {data.linkedinUrl} <ExternalLink style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle' }} />
                    </a>
                  </div>
                )}
              </div>
            </Card>

            {/* ── 5. Team ── */}
            {filteredTeam.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<Users style={{ width: 20, height: 20, color: T.primary }} />} title="Team" />
                <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {filteredTeam.map(member => (
                    <div key={member.id} style={{
                      padding: 16, borderRadius: T.radius, background: T.secondaryBg50,
                      border: `1px solid ${T.cardBorder}`,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>{member.name}</div>
                      {member.title && <div style={{ fontSize: 14, color: T.mutedFg, marginTop: 2 }}>{member.title}</div>}
                      {member.linkedin && (
                        <a href={member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: T.primary, textDecoration: 'none', marginTop: 4, display: 'inline-block' }}>
                          LinkedIn Profile <ExternalLink style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle' }} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── 6. Company Highlights ── */}
            {filteredHighlights.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<Target style={{ width: 20, height: 20, color: T.primary }} />} title="Company Highlights" />
                <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {filteredHighlights.map(item => (
                    <div key={item.id} style={{
                      padding: 16, borderRadius: T.radius, background: T.secondaryBg50,
                      border: `1px solid ${T.cardBorder}`,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>{item.title}</div>
                      {item.description && (
                        <p style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6, marginTop: 4 }}>{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── 7. Revenue Performance Charts ── */}
            {hasChartData && (
              <div data-pdf-section style={{ marginBottom: 24 }}>
                <SectionDivider title="Revenue Performance" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  {/* Revenue Trend Bar Chart */}
                  <Card hover>
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: T.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrendingUp style={{ width: 14, height: 14, color: T.primary }} />
                        </div>
                        <span style={{ fontSize: 14, color: T.mutedFg, fontFamily: T.font }}>Revenue Trend</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 36 }}>
                        <div style={{ width: 16, height: 3, background: CHART_COLORS[0], borderRadius: 2 }} />
                        <span style={{ fontSize: 11, color: T.mutedFg }}>Revenue</span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.mutedFg }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: T.mutedFg }} axisLine={false} tickLine={false}
                            tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`} width={50} />
                          <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} opacity={0.85}>
                            <LabelList dataKey="revenue" position="top" fontSize={9} fontWeight={600} fill={CHART_COLORS[0]}
                              formatter={(v: number) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}MM` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* EBITDA Trend Area Chart */}
                  <Card hover>
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrendingUp style={{ width: 14, height: 14, color: T.green }} />
                        </div>
                        <span style={{ fontSize: 14, color: T.mutedFg, fontFamily: T.font }}>EBITDA Trend</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 36 }}>
                        <div style={{ width: 16, height: 3, background: T.green, borderRadius: 2 }} />
                        <span style={{ fontSize: 11, color: T.mutedFg }}>EBITDA</span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ebitdaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={T.green} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={T.green} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.mutedFg }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: T.mutedFg }} axisLine={false} tickLine={false}
                            tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`} width={50} />
                          <Area type="monotone" dataKey="ebitda" stroke={T.green} fill="url(#ebitdaGrad)" strokeWidth={2} dot={{ r: 3, fill: T.green }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* ── 8. Margin Analysis Charts ── */}
            {hasChartData && marginData.some(d => d.grossMargin !== null || d.ebitdaMargin !== null) && (
              <div data-pdf-section style={{ marginBottom: 24 }}>
                <SectionDivider title="Margin Analysis" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  {/* Gross Margin */}
                  <Card hover>
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: T.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrendingUp style={{ width: 14, height: 14, color: T.primary }} />
                        </div>
                        <span style={{ fontSize: 14, color: T.mutedFg }}>Gross Margin</span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={marginData} margin={{ top: 25, right: 15, left: 10, bottom: 0 }}>
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.mutedFg }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: T.mutedFg }} axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`} width={40} />
                          <Line type="monotone" dataKey="grossMargin" stroke={CHART_COLORS[0]} strokeWidth={2}
                            dot={{ r: 4, fill: CHART_COLORS[0], stroke: '#fff', strokeWidth: 2 }}>
                            <LabelList
                              content={({ x, y, value, index }: any) => {
                                if (value === null || value === undefined) return null;
                                const change = marginData[index]?.gmChange;
                                return (
                                  <g>
                                    <text x={x} y={(y as number) - 10} textAnchor="middle" fontSize={9} fontWeight={600} fill={CHART_COLORS[0]}>
                                      {`${Number(value).toFixed(1)}%`}
                                    </text>
                                    {change !== null && change !== undefined && (
                                      <g>
                                        <rect x={(x as number) - 16} y={(y as number) - 28} width={32} height={14} rx={4}
                                          fill={change >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(220,38,38,0.15)'} />
                                        <text x={x} y={(y as number) - 18} textAnchor="middle" fontSize={8} fontWeight={600}
                                          fill={change >= 0 ? T.emerald600 : T.red600}>
                                          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                        </text>
                                      </g>
                                    )}
                                  </g>
                                );
                              }}
                            />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  {/* EBITDA Margin */}
                  <Card hover>
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TrendingUp style={{ width: 14, height: 14, color: T.green }} />
                        </div>
                        <span style={{ fontSize: 14, color: T.mutedFg }}>EBITDA Margin</span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={marginData} margin={{ top: 25, right: 15, left: 10, bottom: 0 }}>
                          <XAxis dataKey="year" tick={{ fontSize: 11, fill: T.mutedFg }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: T.mutedFg }} axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`} width={40} />
                          <Line type="monotone" dataKey="ebitdaMargin" stroke={T.green} strokeWidth={2}
                            dot={{ r: 4, fill: T.green, stroke: '#fff', strokeWidth: 2 }}>
                            <LabelList
                              content={({ x, y, value, index }: any) => {
                                if (value === null || value === undefined) return null;
                                const change = marginData[index]?.ebitdaMarginChange;
                                return (
                                  <g>
                                    <text x={x} y={(y as number) - 10} textAnchor="middle" fontSize={9} fontWeight={600} fill={T.green}>
                                      {`${Number(value).toFixed(1)}%`}
                                    </text>
                                    {change !== null && change !== undefined && (
                                      <g>
                                        <rect x={(x as number) - 16} y={(y as number) - 28} width={32} height={14} rx={4}
                                          fill={change >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(220,38,38,0.15)'} />
                                        <text x={x} y={(y as number) - 18} textAnchor="middle" fontSize={8} fontWeight={600}
                                          fill={change >= 0 ? T.emerald600 : T.red600}>
                                          {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                        </text>
                                      </g>
                                    )}
                                  </g>
                                );
                              }}
                            />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* ── 9. Financials Table ── */}
            {data.financialYears.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<TrendingUp style={{ width: 20, height: 20, color: T.primary }} />} title="Financials" />
                <div style={{ padding: '16px 24px 24px' }}>
                  <div style={{ background: T.secondaryBg, borderRadius: T.radius, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: T.font }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.primary20}` }}>
                          <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Year</th>
                          <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Total Revenue</th>
                          {hasRevGrowth && <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Rev. Growth</th>}
                          <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Gross Margin</th>
                          {hasGmChange && <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Δ</th>}
                          <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>EBITDA</th>
                          {hasEbitdaChange && <th style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>Δ</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.financialYears.map((fy, idx) => {
                          const fyAny = fy as any;
                          const ebitdaVal = parseNum(fy.ebitda);
                          const isNeg = ebitdaVal !== null && ebitdaVal < 0;
                          return (
                            <tr key={fy.id} style={{
                              background: idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                              borderBottom: `1px solid ${T.cardBorder}`,
                            }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                              onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent')}
                            >
                              <td style={{ padding: 12, textAlign: 'center', fontWeight: 600, color: T.fg }}>{fy.year}</td>
                              <td style={{ padding: 12, textAlign: 'center', color: T.fg }}>{fmtCurrency(fy.revenue)}</td>
                              {hasRevGrowth && (
                                <td style={{ padding: 12, textAlign: 'center', color: T.emerald600 }}>{fyAny.rev_growth || '—'}</td>
                              )}
                              <td style={{ padding: 12, textAlign: 'center', color: T.fg }}>{fy.gross_margin || '—'}</td>
                              {hasGmChange && (
                                <td style={{ padding: 12, textAlign: 'center', color: T.mutedFg }}>{fyAny.gross_margin_change || '—'}</td>
                              )}
                              <td style={{ padding: 12, textAlign: 'center', color: isNeg ? T.red600 : T.fg }}>{fmtCurrency(fy.ebitda)}</td>
                              {hasEbitdaChange && (
                                <td style={{ padding: 12, textAlign: 'center', color: T.mutedFg }}>{fyAny.ebitda_change || '—'}</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Existing Debt */}
                  {data.existingDebtDetails && (
                    <div style={{ background: T.secondaryBg, borderRadius: T.radius, padding: 16, marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.fg, marginBottom: 4 }}>Existing Debt</div>
                      <p style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6 }}>{data.existingDebtDetails}</p>
                    </div>
                  )}

                  {/* Commentary Notes */}
                  {data.financialComments.length > 0 && (
                    <div style={{ background: T.secondaryBg, borderRadius: T.radius, padding: 16, marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.fg, marginBottom: 8 }}>Commentary Notes</div>
                      {data.financialComments.map(fc => (
                        <div key={fc.id} style={{ marginBottom: 8 }}>
                          {fc.title && <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>{fc.title}</div>}
                          {fc.description && <p style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.5, marginTop: 2 }}>{fc.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* ── 10. Ownership & Equity ── */}
            {(owners.length > 0 || totalEquityRaised) && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<PieChartIcon style={{ width: 20, height: 20, color: T.primary }} />} title="Ownership & Equity" />
                <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: owners.length > 0 ? '220px 1fr' : '1fr', gap: 24, alignItems: 'start' }}>
                  {/* Donut Chart */}
                  {owners.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie
                            data={owners.map((o, i) => ({ name: o.owner_name, value: o.ownership_percentage, idx: i }))}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                            onMouseEnter={(_, idx) => setActiveOwnerIdx(idx)}
                            onMouseLeave={() => setActiveOwnerIdx(null)}
                          >
                            {owners.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          {/* Center label */}
                          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
                            style={{ fontSize: 11, fontWeight: 600, fill: T.fg, fontFamily: T.font }}>
                            {activeOwnerIdx !== null ? owners[activeOwnerIdx].owner_name.slice(0, 14) : 'Ownership'}
                          </text>
                          <text x="50%" y="58%" textAnchor="middle" dominantBaseline="central"
                            style={{ fontSize: 14, fontWeight: 700, fill: T.primary, fontFamily: T.font }}>
                            {activeOwnerIdx !== null ? `${owners[activeOwnerIdx].ownership_percentage}%` : `${owners.reduce((s, o) => s + o.ownership_percentage, 0)}%`}
                          </text>
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Legend */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                        {owners.map((o, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.mutedFg }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            {o.owner_name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shareholders table */}
                  <div>
                    <div style={{ background: T.secondaryBg, borderRadius: T.radius, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: T.font }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${T.primary20}` }}>
                            <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: T.fg }}>Top Shareholders</th>
                            <th style={{ padding: 12, textAlign: 'right', fontWeight: 600, color: T.fg }}>Ownership</th>
                          </tr>
                        </thead>
                        <tbody>
                          {owners.map((o, i) => (
                            <tr key={i}
                              style={{
                                borderBottom: `1px solid ${T.cardBorder}`,
                                background: activeOwnerIdx === i ? 'rgba(0,0,0,0.04)' : 'transparent',
                              }}
                              onMouseEnter={() => setActiveOwnerIdx(i)}
                              onMouseLeave={() => setActiveOwnerIdx(null)}
                            >
                              <td style={{ padding: 12, color: T.fg, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                                {o.owner_name}
                              </td>
                              <td style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: T.fg }}>{o.ownership_percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalEquityRaised && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Total Equity Raised</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: T.fg }}>{totalEquityRaised}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ── 11. Key Items (below Ownership) ── */}
            {filteredKeyItems.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<Target style={{ width: 20, height: 20, color: T.primary }} />} title="Key Items" />
                <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {filteredKeyItems.map((item, idx) => (
                    <div key={item.id} style={{
                      padding: 16, borderRadius: T.radius, background: T.secondaryBg50,
                      border: `1px solid ${T.cardBorder}`,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: T.fg }}>{item.title}</div>
                      {item.description && (
                        <p style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6, marginTop: 4 }}>{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0" style={{ fontFamily: T.font }}>
          <button onClick={() => onOpenChange(false)}
            style={{
              padding: '8px 20px', fontSize: 14, fontWeight: 500, borderRadius: T.radius,
              border: `1px solid ${T.cardBorder}`, background: T.cardBg, color: T.fg, cursor: 'pointer',
              fontFamily: T.font,
            }}>
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

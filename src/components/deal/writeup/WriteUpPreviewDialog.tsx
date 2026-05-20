import React, { useState, useMemo, useRef, useCallback } from 'react';
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

/* ── Formatters ── */
const fmtPct = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(1)).toString();
};
const fmtEquityRaised = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  // If user already provided formatting (e.g. "$7M", "7MM"), keep as-is
  if (/[a-zA-Z$,]/.test(trimmed) && !/^\$?\s*[\d.,]+\s*$/.test(trimmed)) return trimmed;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return trimmed;
  if (numeric >= 1_000_000) {
    const mm = numeric / 1_000_000;
    return `$${mm.toFixed(1)}MM`;
  }
  return `$${numeric.toLocaleString('en-US')}`;
};

/* ── Props ── */
interface WriteUpPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DealWriteUpData;
  owners: Array<{ owner_name: string; ownership_percentage: number; owner_url?: string | null }>;
  totalEquityRaised: string;
  dealManager?: string;
  disclaimer?: string;
}

/* ── Helpers ── */
function fmtCurrency(value: string | undefined): string {
  if (!value) return '—';
  const upper = value.toUpperCase();
  const isNegative = value.startsWith('(') || value.startsWith('-');
  const hasMM = upper.includes('MM') || upper.includes('M');
  const hasK = upper.includes('K');
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return value;
  const absNum = num;
  const sign = isNegative ? '-' : '';
  // If value was already expressed in MM (e.g. "$7.49MM" → num=7.49), format as $X.XMM
  if (hasMM && absNum < 1_000) return `${sign}$${absNum.toFixed(1)}MM`;
  if (hasK && absNum < 1_000_000) return `${sign}$${absNum.toFixed(1)}K`;
  // Raw large numbers
  if (absNum >= 1_000_000) return `${sign}$${(absNum / 1_000_000).toFixed(1)}MM`;
  if (absNum >= 1_000) return `${sign}$${(absNum / 1_000).toFixed(1)}K`;
  return `${sign}$${absNum.toLocaleString()}`;
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const isNegative = v.startsWith('(') || v.startsWith('-') || (v.includes('(') && v.includes(')'));
  const cleaned = v.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return isNegative ? -n : n;
}

function parsePct(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

/** Convert plain text with bullet prefixes (- or *) into HTML list */
function renderBulletText(text: string): React.ReactNode {
  if (!text) return '—';
  const lines = text.split('\n').filter(l => l.trim());
  const hasBullets = lines.some(l => /^\s*[-*•]\s/.test(l));
  if (!hasBullets) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
      {lines.map((line, i) => (
        <li key={i} style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6 }}>
          {line.replace(/^\s*[-*•]\s*/, '')}
        </li>
      ))}
    </ul>
  );
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
    secondary: { ...base, background: T.secondaryBg, color: T.fg, padding: '4px 12px', border: '1px solid transparent' },
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

/* ────────────────────────────────────────────────────────────────────────── */
/* Print-to-PDF helper                                                        */
/*                                                                            */
/* We use the browser's native print pipeline instead of generating the PDF   */
/* programmatically. The on-screen preview is already styled with rich inline */
/* CSS, so cloning its DOM into a hidden iframe and calling `window.print()`  */
/* preserves the design 1:1 — fonts, spacing, colors, charts (SVG), the lot. */
/* The user picks "Save as PDF" in the system dialog, which is the highest-  */
/* fidelity path the browser offers.                                          */
/* ────────────────────────────────────────────────────────────────────────── */
async function printElementAsPdf(element: HTMLElement | null, documentTitle: string): Promise<void> {
  if (!element) return;

  // Hidden iframe avoids popup-blocker issues and keeps the user in-context.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* no-op */ }
    }, 1000);
  };

  const printDoc = iframe.contentDocument;
  if (!printDoc) { cleanup(); return; }

  // Print stylesheet — restrained margins, no chrome, sensible page-break
  // rules so headings/sections don't split awkwardly.
  const printCss = `
    @page {
      size: Letter;
      margin: 0.55in 0.5in 0.6in 0.5in;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      body {
        font-family: 'Manrope', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      /* Hide any UI chrome that might sneak in (interactive controls, etc.). */
      button, .no-print, [data-no-print] { display: none !important; }

      /* Logical page-break rules — keep cards & headings whole. */
      [data-pdf-section] {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      h1, h2, h3, h4 {
        break-after: avoid-page;
        page-break-after: avoid;
      }
      table, figure, svg, img {
        break-inside: avoid;
        page-break-inside: avoid;
        max-width: 100% !important;
      }
      /* Preserve background fills on cards/badges/charts. */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* Keep the preview width predictable inside the printed page. */
      .print-root {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
    }
    /* Screen styles for the iframe doc itself (it never shows on screen
       but we keep things sane in case the user inspects). */
    body { background: #ffffff; margin: 0; padding: 0; }
  `;

  // Reuse stylesheets from the host document so font-faces / icon fonts work.
  const linkedStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.outerHTML)
    .join('\n');
  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map((s) => s.outerHTML)
    .join('\n');

  printDoc.open();
  printDoc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${documentTitle.replace(/[<>]/g, '')}</title>
    ${linkedStyles}
    ${inlineStyles}
    <style>${printCss}</style>
  </head>
  <body>
    <div class="print-root">${element.outerHTML}</div>
  </body>
</html>`);
  printDoc.close();

  // Wait for fonts + images inside the iframe before triggering print, so
  // the rendered output actually matches the on-screen preview.
  const win = iframe.contentWindow;
  if (!win) { cleanup(); return; }

  const fontsReady = (printDoc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
    ?? Promise.resolve();
  const images = Array.from(printDoc.images || []);
  const imagesReady = Promise.all(images.map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    }),
  ));

  await Promise.race([
    Promise.all([fontsReady, imagesReady]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  // Set the document title last — this becomes the default PDF filename in
  // the browser's "Save as PDF" dialog.
  try { printDoc.title = documentTitle; } catch { /* no-op */ }

  win.focus();
  win.print();
  cleanup();
}

/* ── Main component ── */
export function WriteUpPreviewDialog({ open, onOpenChange, data, owners, totalEquityRaised, dealManager, disclaimer }: WriteUpPreviewDialogProps) {
  const dealTypeLabels = dealTypeIdsToLabels(data.dealTypes);
  const filteredTeam = (data.team || []).filter(m => m.name.trim());
  const filteredKeyItems = (data.keyItems || []).filter(i => i.title?.trim());
  const filteredHighlights = data.companyHighlights.filter(i => i.title.trim());
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const companyName = data.publishAsAnonymous ? 'Anonymous Company' : (data.companyName || 'Untitled Company');

  const handleDownloadPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await printElementAsPdf(contentRef.current, `${companyName} — Write-Up`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [companyName, isExporting]);

  // Parse financial data for charts — add A/P suffix to year labels
  const chartData = useMemo(() => {
    const currentCalYear = new Date().getFullYear();
    return data.financialYears.map(fy => {
      const rev = parseNum(fy.revenue);
      const ebitda = parseNum(fy.ebitda);
      const gm = parsePct(fy.gross_margin);
      const yearMatch = fy.year?.match(/(\d{4})/);
      const numYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const suffix = numYear !== null ? (numYear <= currentCalYear ? 'A' : 'P') : '';
      const yearLabel = numYear !== null ? `${numYear}${suffix}` : fy.year;
      return { year: yearLabel, revenue: rev, ebitda, grossMargin: gm };
    }).filter(d => d.year).sort((a, b) => {
      const parseYear = (y: string) => { const m = y.match(/(\d{4})/); return m ? parseInt(m[1], 10) : 0; };
      return parseYear(a.year) - parseYear(b.year);
    });
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
                    <div style={{ fontSize: 14, color: T.mutedFg, marginTop: 6 }}>{renderBulletText(data.useOfFunds)}</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* ── 3. Key Items ── */}
            {filteredKeyItems.length > 0 && (
              <Card data-pdf-section className="mb-6">
                <CardHeader icon={<Shield style={{ width: 20, height: 20, color: T.primary }} />} title="Key Items" />
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
                  { label: 'Billing Model', value: data.billingModels.length > 0 ? data.billingModels.join(', ') : null },
                  { label: 'Headquarters', value: data.location },
                  { label: 'Industry', value: data.industries.join(', ') },
                  { label: 'Year Founded', value: data.yearFounded },
                  { label: 'Customer Base', value: data.customerBase?.join(', ') },
                  { label: 'Headcount', value: data.headcount },
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
                <div style={{ padding: '16px 24px 24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: T.mutedFg, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: T.mutedFg, textTransform: 'uppercase', letterSpacing: 0.5 }}>Title</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: T.mutedFg, textTransform: 'uppercase', letterSpacing: 0.5 }}>LinkedIn Profile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeam.map(member => (
                        <tr key={member.id} style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                          <td style={{ padding: '10px 12px', color: T.fg, fontWeight: 500 }}>{member.name}</td>
                          <td style={{ padding: '10px 12px', color: T.mutedFg }}>{member.title || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {member.linkedin ? (
                              <a href={member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 13, color: T.primary, textDecoration: 'none' }}>
                                View Profile <ExternalLink style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle' }} />
                              </a>
                            ) : (
                              <span style={{ color: T.mutedFg }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                            tickFormatter={v => {
                              const abs = Math.abs(v);
                              const sign = v < 0 ? '-' : '';
                              if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(0)}M`;
                              if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`;
                              return `${sign}$${abs}`;
                            }} width={55} domain={['auto', 'auto']} />
                          {chartData.some(d => d.ebitda !== null && d.ebitda < 0) && <ReferenceLine y={0} stroke={T.cardBorder} strokeDasharray="3 3" />}
                          <Area type="monotone" dataKey="ebitda" stroke={T.green} fill="url(#ebitdaGrad)" strokeWidth={1} dot={{ r: 3, fill: T.green }} baseValue={0} />
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
                          <Line type="monotone" dataKey="grossMargin" stroke={CHART_COLORS[0]} strokeWidth={1}
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
                          <Line type="monotone" dataKey="ebitdaMargin" stroke={T.green} strokeWidth={1}
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
                  {(data.existingDebtItems?.length > 0 || data.existingDebtDetails) && (
                    <div style={{ background: T.secondaryBg, borderRadius: T.radius, padding: 16, marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.fg, marginBottom: 8 }}>Existing Debt</div>
                      {data.existingDebtItems?.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: `1px solid ${T.cardBorder}`, color: T.mutedFg, textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Funding Source</th>
                                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Amount</th>
                                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Type</th>
                                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Maturity</th>
                                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.existingDebtItems.map((it) => {
                                const mat = it.maturityDate ? new Date(it.maturityDate) : null;
                                const matLabel = mat && !isNaN(mat.getTime())
                                  ? `${String(mat.getMonth() + 1).padStart(2, '0')}/${mat.getFullYear()}`
                                  : '—';
                                return (
                                  <tr key={it.id} style={{ borderBottom: `1px solid ${T.cardBorder}`, color: T.fg }}>
                                    <td style={{ padding: '6px 8px' }}>{it.lender || '—'}</td>
                                    <td style={{ padding: '6px 8px' }}>{it.amount || '—'}</td>
                                    <td style={{ padding: '6px 8px' }}>{it.type || '—'}</td>
                                    <td style={{ padding: '6px 8px' }}>{matLabel}</td>
                                    <td style={{ padding: '6px 8px', color: T.mutedFg }}>{it.notes || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ fontSize: 14, color: T.mutedFg, lineHeight: 1.6 }}>{renderBulletText(data.existingDebtDetails)}</div>
                      )}
                    </div>
                  )}

                  {/* Commentary Notes */}
                  {data.financialComments.length > 0 && (
                    <div style={{ background: T.secondaryBg, borderRadius: T.radius, padding: 16, marginTop: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.fg, marginBottom: 8 }}>Commentary Notes</div>
                      {data.financialComments.map(fc => (
                        <div key={fc.id} style={{ marginBottom: 8 }}>
                          {fc.title && <div style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>{fc.title}</div>}
                          {fc.description && <div style={{ fontSize: 13, color: T.mutedFg, lineHeight: 1.5, marginTop: 2 }}>{renderBulletText(fc.description)}</div>}
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
                            {activeOwnerIdx !== null ? `${fmtPct(owners[activeOwnerIdx].ownership_percentage)}%` : `${fmtPct(owners.reduce((s, o) => s + o.ownership_percentage, 0))}%`}
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
                              <td style={{ padding: 12, textAlign: 'right', fontWeight: 500, color: T.fg }}>{fmtPct(o.ownership_percentage)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalEquityRaised && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', marginTop: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.fg }}>Total Equity Raised</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: T.fg }}>{fmtEquityRaised(totalEquityRaised)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Duplicate Key Items section removed — already rendered in section 3 above */}

            {/* ── Disclaimer ── */}
            {disclaimer && disclaimer.trim() && (
              <div data-pdf-section style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.cardBorder}` }}>
                <p style={{
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: T.mutedFg,
                  fontFamily: T.font,
                  fontStyle: 'italic',
                  whiteSpace: 'pre-wrap',
                }}>
                  {disclaimer}
                </p>
              </div>
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

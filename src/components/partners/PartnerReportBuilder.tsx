import { useState, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileDown, CalendarIcon, Users, Handshake, DollarSign, TrendingUp, ArrowRightLeft } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type TimePeriod = '7d' | '30d' | '90d';

interface InsightItem {
  id: string;
  type: string;
  summary: string;
  userName?: string;
  timestamp: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  insights: InsightItem[];
  period: TimePeriod;
}

const SECTIONS = [
  { key: 'pipeline', label: 'Pipeline Movements' },
  { key: 'deals', label: 'Deals Referred' },
  { key: 'leaderboard', label: 'Leaderboard Highlights' },
  { key: 'insights', label: 'Insights Feed' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

const TYPE_MAP: Record<string, SectionKey> = {
  stage_move: 'pipeline',
  new_deal: 'deals',
  memo_update: 'insights',
  new_partner: 'insights',
  stale_alert: 'insights',
};

function fmtAbbrevValue(val: number): string {
  const abs = Math.abs(val);
  let formatted: string;
  if (abs >= 1_000_000_000) formatted = `$${(abs / 1_000_000_000).toFixed(2)}B`;
  else if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(2)}MM`;
  else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(2)}K`;
  else formatted = `$${abs.toFixed(2)}`;
  return val < 0 ? `(${formatted})` : formatted;
}

const DONUT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function stageColorToHex(color: string): string {
  const map: Record<string, string> = {
    'bg-yellow-500': '#eab308', 'bg-amber-500': '#f59e0b', 'bg-pink-500': '#ec4899',
    'bg-rose-500': '#f43f5e', 'bg-green-500': '#22c55e', 'bg-emerald-500': '#10b981',
    'bg-red-500': '#ef4444', 'bg-blue-500': '#3b82f6', 'bg-indigo-500': '#6366f1',
    'bg-violet-500': '#8b5cf6', 'bg-purple-500': '#a855f7', 'bg-fuchsia-500': '#d946ef',
    'bg-cyan-500': '#06b6d4', 'bg-teal-500': '#14b8a6', 'bg-orange-500': '#f97316',
    'bg-slate-500': '#64748b', 'bg-gray-500': '#6b7280', 'bg-lime-500': '#84cc16',
    'bg-sky-500': '#0ea5e9',
  };
  if (color?.startsWith('#')) return color;
  return map[color] || '#6366f1';
}

function lighten(hex: string, pct: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * pct));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * pct));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * pct));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function PartnerReportBuilder({ open, onClose, insights, period }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { data: partners = [] } = usePartners();
  const { data: stages = [] } = usePipelineStages();
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), periodDays));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [enabledSections, setEnabledSections] = useState<Set<SectionKey>>(
    new Set(SECTIONS.map(s => s.key))
  );
  const [execSummary, setExecSummary] = useState('');
  const [commentary, setCommentary] = useState<Record<SectionKey, string>>({
    pipeline: '', deals: '', leaderboard: '', insights: '',
  });
  const [exporting, setExporting] = useState(false);

  const barChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);

  const toggleSection = (key: SectionKey) => {
    setEnabledSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filteredInsights = useMemo(() => {
    const from = dateFrom.toISOString();
    const to = dateTo.toISOString();
    return insights.filter(i => i.timestamp >= from && i.timestamp <= to);
  }, [insights, dateFrom, dateTo]);

  const groupedInsights = useMemo(() => {
    const groups: Record<SectionKey, InsightItem[]> = {
      pipeline: [], deals: [], memos: [], leaderboard: [], insights: [],
    };
    for (const i of filteredInsights) {
      const section = TYPE_MAP[i.type] || 'insights';
      groups[section].push(i);
    }
    return groups;
  }, [filteredInsights]);

  // --- Metrics ---
  const fromISO = dateFrom.toISOString();
  const newPartnersCount = useMemo(
    () => partners.filter(p => p.created_at && p.created_at >= fromISO).length,
    [partners, fromISO]
  );
  const stageMovesCount = groupedInsights.pipeline.length;
  const totalDealsReferred = groupedInsights.deals.length;
  const totalReferredValue = useMemo(() => {
    let sum = 0;
    for (const i of groupedInsights.deals) {
      const m = i.summary.match(/\$([0-9,.]+)k?/);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        sum += i.summary.includes('k') ? val * 1000 : val;
      }
    }
    return sum;
  }, [groupedInsights.deals]);

  // --- Chart data ---
  const stageChartData = useMemo(() => {
    const countMap = new Map<string, number>();
    partners.forEach(p => {
      const sid = p.stage_id || '';
      countMap.set(sid, (countMap.get(sid) || 0) + 1);
    });
    return stages.map(s => ({
      name: s.name,
      count: countMap.get(s.id) || 0,
      color: stageColorToHex(s.color),
    }));
  }, [partners, stages]);

  const dealsBySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of groupedInsights.deals) {
      const m = i.summary.match(/referred by (.+)$/);
      const src = m ? m[1] : 'Unknown';
      counts.set(src, (counts.get(src) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value], idx) => ({ name, value, fill: DONUT_COLORS[idx % DONUT_COLORS.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [groupedInsights.deals]);

  // --- Pre-populated section text ---
  const sectionText = useMemo(() => {
    const texts: Record<SectionKey, string> = {
      pipeline: '',
      deals: '',
      memos: '',
      leaderboard: '',
      insights: '',
    };

    // Pipeline
    if (groupedInsights.pipeline.length > 0) {
      texts.pipeline = groupedInsights.pipeline
        .map(i => `• ${i.summary}${i.userName ? ` — ${i.userName}` : ''} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
        .join('\n');
    } else {
      texts.pipeline = 'No pipeline movements during this period.';
    }

    // Deals
    if (groupedInsights.deals.length > 0) {
      texts.deals = `${totalDealsReferred} deal(s) referred during this period with a total estimated value of $${totalReferredValue.toLocaleString()}.\n\n` +
        groupedInsights.deals
          .map(i => `• ${i.summary} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
          .join('\n');
    } else {
      texts.deals = 'No deals referred during this period.';
    }

    // Memos
    if (groupedInsights.memos.length > 0) {
      texts.memos = groupedInsights.memos
        .map(i => `• ${i.summary}${i.userName ? ` — ${i.userName}` : ''} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
        .join('\n');
    } else {
      texts.memos = 'No memo updates during this period.';
    }

    // Leaderboard
    if (dealsBySource.length > 0) {
      texts.leaderboard = 'Top Referral Sources:\n' +
        dealsBySource.map((s, i) => `${i + 1}. ${s.name} — ${s.value} deal(s)`).join('\n');
    } else {
      texts.leaderboard = 'No referral data available for this period.';
    }

    // Insights
    const otherInsights = groupedInsights.insights;
    if (otherInsights.length > 0) {
      texts.insights = otherInsights
        .map(i => `• ${i.summary}${i.userName ? ` — ${i.userName}` : ''} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
        .join('\n');
    } else {
      texts.insights = 'No additional insights during this period.';
    }

    return texts;
  }, [groupedInsights, totalDealsReferred, totalReferredValue, dealsBySource]);

  // Editable text per section — start from pre-populated
  const [editedText, setEditedText] = useState<Record<SectionKey, string | null>>({
    pipeline: null, deals: null, memos: null, leaderboard: null, insights: null,
  });

  const getSectionContent = (key: SectionKey) => editedText[key] ?? sectionText[key];

  const captureChartAsImage = useCallback(async (ref: React.RefObject<HTMLDivElement>): Promise<string | null> => {
    if (!ref.current) return null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(ref.current, { backgroundColor: '#0f172a', scale: 2 });
      return canvas.toDataURL('image/png');
    } catch { return null; }
  }, []);

  const exportPDF = async () => {
    setExporting(true);
    try {
      // Capture charts first
      const [barImg, pieImg] = await Promise.all([
        captureChartAsImage(barChartRef),
        captureChartAsImage(pieChartRef),
      ]);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;

      // Cover page
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.text('Partner Insights Report', margin, 80);
      doc.setFontSize(14);
      doc.setTextColor(148, 163, 184);
      doc.text(`${format(dateFrom, 'MMM d, yyyy')} — ${format(dateTo, 'MMM d, yyyy')}`, margin, 95);
      doc.setFontSize(12);
      doc.text(company?.name || '', margin, 115);
      doc.text(`Generated by ${(user as any)?.user_metadata?.display_name || user?.email || 'User'}`, margin, 128);
      doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy')}`, margin, 141);

      // Content
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      let y = margin;

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 15) { doc.addPage(); y = margin; }
      };

      const addHeading = (text: string) => {
        ensureSpace(20);
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(text, margin, y);
        y += 3;
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentW, y);
        y += 8;
      };

      const addParagraph = (text: string) => {
        if (!text.trim()) return;
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, contentW);
        for (const line of lines) {
          if (y > pageH - 15) { doc.addPage(); y = margin; }
          doc.text(line, margin, y);
          y += 5;
        }
        y += 4;
      };

      // Summary metrics
      addHeading('Key Metrics');
      const metrics = [
        ['Total Partners', partners.length.toString()],
        ['Partners Added', newPartnersCount.toString()],
        ['Deals Referred', totalDealsReferred.toString()],
        ['Referred Value', `$${totalReferredValue.toLocaleString()}`],
        ['Stage Movements', stageMovesCount.toString()],
      ];
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [metrics.map(m => m[0])],
        body: [metrics.map(m => m[1])],
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 11, textColor: [15, 23, 42], halign: 'center', fontStyle: 'bold' },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Charts
      if (barImg) {
        ensureSpace(70);
        addHeading('Partners by Stage');
        const imgW = contentW;
        const imgH = 55;
        doc.addImage(barImg, 'PNG', margin, y, imgW, imgH);
        y += imgH + 10;
      }

      if (pieImg && dealsBySource.length > 0) {
        ensureSpace(70);
        addHeading('Deals by Referral Source');
        const imgW = contentW * 0.6;
        const imgH = 55;
        doc.addImage(pieImg, 'PNG', margin + (contentW - imgW) / 2, y, imgW, imgH);
        y += imgH + 10;
      }

      // Exec summary
      if (execSummary.trim()) {
        addHeading('Executive Summary');
        addParagraph(execSummary);
      }

      // Sections
      for (const section of SECTIONS) {
        if (!enabledSections.has(section.key)) continue;
        const content = getSectionContent(section.key);
        addHeading(section.label);
        addParagraph(content);

        const note = commentary[section.key];
        if (note?.trim()) {
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          doc.text('Commentary:', margin, y);
          y += 5;
          addParagraph(note);
        }
      }

      doc.save(`Partner_Insights_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const metricCards = [
    { label: 'Total Partners', value: partners.length, icon: Users, color: 'text-blue-400' },
    { label: 'Deals Referred', value: totalDealsReferred, icon: Handshake, color: 'text-green-400' },
    { label: 'Referred Value', value: `$${totalReferredValue.toLocaleString()}`, icon: DollarSign, color: 'text-amber-400' },
    { label: 'Partners Added', value: newPartnersCount, icon: TrendingUp, color: 'text-cyan-400' },
    { label: 'Stage Movements', value: stageMovesCount, icon: ArrowRightLeft, color: 'text-purple-400' },
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Partner Insights Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Date range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[160px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateFrom, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={d => d && setDateFrom(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[160px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateTo, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={d => d && setDateTo(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Sections to include */}
          <div>
            <Label className="text-xs mb-2 block">Include Sections</Label>
            <div className="flex flex-wrap gap-3">
              {SECTIONS.map(s => (
                <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={enabledSections.has(s.key)} onCheckedChange={() => toggleSection(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Metric widgets */}
          <div className="grid grid-cols-5 gap-2">
            {metricCards.map(m => (
              <div key={m.label} className="rounded-lg border border-border bg-card p-3 flex flex-col items-center gap-1">
                <m.icon className={`h-4 w-4 ${m.color}`} />
                <span className="text-lg font-bold">{m.value}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{m.label}</span>
              </div>
            ))}
          </div>

          {/* Charts side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bar chart */}
            <div ref={barChartRef} className="rounded-lg border border-border bg-card p-4 min-h-[220px]">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Partners by Stage</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stageChartData} margin={{ top: 16, right: 5, left: 0, bottom: 30 }}>
                  <defs>
                    {stageChartData.map((d, i) => (
                      <linearGradient key={i} id={`rg-${i}`} x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor={d.color} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={lighten(d.color, 0.25)} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis dataKey="name" tick={{ fill: '#e5e7eb', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={40} />
                  <YAxis tick={{ fill: '#e5e7eb', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="count" position="top" fill="#e5e7eb" fontSize={10} fontWeight={600} />
                    {stageChartData.map((_, i) => (
                      <Cell key={i} fill={`url(#rg-${i})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Donut chart */}
            <div ref={pieChartRef} className="rounded-lg border border-border bg-card p-4 min-h-[220px]">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Deals by Referral Source</p>
              {dealsBySource.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <defs>
                      {dealsBySource.map((d, i) => (
                        <linearGradient key={i} id={`pg-${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={d.fill} stopOpacity={1} />
                          <stop offset="100%" stopColor={lighten(d.fill, 0.2)} stopOpacity={0.85} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={dealsBySource}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      paddingAngle={2}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {dealsBySource.map((_, i) => (
                        <Cell key={i} fill={`url(#pg-${i})`} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[180px] text-xs text-muted-foreground italic">
                  No referral data for this period.
                </div>
              )}
            </div>
          </div>

          {/* Executive Summary */}
          <div>
            <Label className="text-xs mb-1 block">Executive Summary</Label>
            <Textarea
              placeholder="Write an overall narrative for this report..."
              value={execSummary}
              onChange={e => setExecSummary(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Section previews — pre-populated and editable */}
          {SECTIONS.filter(s => enabledSections.has(s.key)).map(section => {
            const content = getSectionContent(section.key);
            return (
              <div key={section.key} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <h4 className="text-sm font-semibold">{section.label}</h4>
                <Textarea
                  value={content}
                  onChange={e => setEditedText(prev => ({ ...prev, [section.key]: e.target.value }))}
                  className="min-h-[100px] text-sm font-mono"
                />
                <Textarea
                  placeholder={`Optional commentary for ${section.label}...`}
                  value={commentary[section.key]}
                  onChange={e => setCommentary(prev => ({ ...prev, [section.key]: e.target.value }))}
                  className="min-h-[50px] text-sm"
                />
              </div>
            );
          })}

          {/* Export button */}
          <div className="flex justify-end">
            <Button onClick={exportPDF} disabled={exporting} className="gap-2">
              <FileDown className="h-4 w-4" />
              {exporting ? 'Generating...' : 'Export to PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

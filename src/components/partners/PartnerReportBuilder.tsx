import { useState, useMemo, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FileDown, CalendarIcon, Users, Handshake, DollarSign, TrendingUp, ArrowRightLeft, AlertCircle, ChevronDown } from 'lucide-react';
import { format, subDays, subMonths } from 'date-fns';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie,
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
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

const TYPE_MAP: Record<string, SectionKey | 'feed'> = {
  stage_move: 'pipeline',
  new_deal: 'deals',
  memo_update: 'feed',
  new_partner: 'feed',
  stale_alert: 'feed',
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

const DONUT_COLORS = [
  ['#3b82f6', '#60a5fa'],
  ['#10b981', '#34d399'],
  ['#f59e0b', '#fbbf24'],
  ['#64748b', '#94a3b8'],
];

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

const MIN_INSIGHTS = 3;
const MAX_INSIGHTS = 5;

export function PartnerReportBuilder({ open, onClose, insights, period }: Props) {
  const { user } = useAuth();
  const { company } = useCompany();
  const { data: partners = [] } = usePartners();
  const { data: stages = [] } = usePipelineStages();
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), periodDays));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [quickFilter, setQuickFilter] = useState<string>('custom');
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [enabledSections, setEnabledSections] = useState<Set<SectionKey>>(
    new Set(SECTIONS.map(s => s.key))
  );
  const [execSummary, setExecSummary] = useState('');
  const [commentary, setCommentary] = useState<Record<SectionKey, string>>({
    pipeline: '', deals: '', leaderboard: '',
  });
  const [exporting, setExporting] = useState(false);
  const [selectedInsightIds, setSelectedInsightIds] = useState<Set<string>>(new Set());
  const [insightCommentary, setInsightCommentary] = useState<Record<string, string>>({});

  const applyQuickFilter = (key: string, year?: number) => {
    const y = year ?? filterYear;
    setQuickFilter(key);
    switch (key) {
      case 'q1': setDateFrom(new Date(y, 0, 1)); setDateTo(new Date(y, 2, 31)); break;
      case 'q2': setDateFrom(new Date(y, 3, 1)); setDateTo(new Date(y, 5, 30)); break;
      case 'q3': setDateFrom(new Date(y, 6, 1)); setDateTo(new Date(y, 8, 30)); break;
      case 'q4': setDateFrom(new Date(y, 9, 1)); setDateTo(new Date(y, 11, 31)); break;
      case 'full_year': setDateFrom(new Date(y, 0, 1)); setDateTo(new Date(y, 11, 31)); break;
      case 'past_3m': setDateFrom(subMonths(new Date(), 3)); setDateTo(new Date()); break;
      case 'past_6m': setDateFrom(subMonths(new Date(), 6)); setDateTo(new Date()); break;
      case 'ttm': setDateFrom(subMonths(new Date(), 12)); setDateTo(new Date()); break;
      default: break;
    }
  };

  const handleManualDateFrom = (d: Date) => {
    setDateFrom(d);
    setQuickFilter('custom');
  };
  const handleManualDateTo = (d: Date) => {
    setDateTo(d);
    setQuickFilter('custom');
  };

  const handleYearChange = (y: string) => {
    const year = parseInt(y, 10);
    setFilterYear(year);
    if (quickFilter !== 'custom' && !['past_3m', 'past_6m', 'ttm'].includes(quickFilter)) {
      applyQuickFilter(quickFilter, year);
    }
  };

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

  // Feed insights (all types that go into the selectable list)
  const feedInsights = useMemo(() => {
    return filteredInsights.filter(i => {
      const mapped = TYPE_MAP[i.type];
      return mapped === 'feed' || !mapped;
    });
  }, [filteredInsights]);

  // All insights for the feed (including pipeline/deals types for the selectable list)
  const allSelectableInsights = useMemo(() => {
    return filteredInsights.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [filteredInsights]);

  const groupedInsights = useMemo(() => {
    const groups: Record<SectionKey, InsightItem[]> = {
      pipeline: [], deals: [], leaderboard: [],
    };
    for (const i of filteredInsights) {
      const section = TYPE_MAP[i.type];
      if (section && section !== 'feed' && groups[section]) {
        groups[section].push(i);
      }
    }
    return groups;
  }, [filteredInsights]);

  const toggleInsight = (id: string) => {
    setSelectedInsightIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_INSIGHTS) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const selectedCount = selectedInsightIds.size;
  const canExport = selectedCount >= MIN_INSIGHTS;

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
    const sorted = Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 3);
    const otherCount = sorted.slice(3).reduce((s, e) => s + e.value, 0);
    const result = top.map((e, idx) => ({ ...e, colorPair: DONUT_COLORS[idx] }));
    if (otherCount > 0) result.push({ name: 'Other', value: otherCount, colorPair: DONUT_COLORS[3] });
    return result;
  }, [groupedInsights.deals]);

  const donutTotal = dealsBySource.reduce((s, e) => s + e.value, 0);

  // --- Pre-populated section text ---
  const sectionText = useMemo(() => {
    const texts: Record<SectionKey, string> = {
      pipeline: '',
      deals: '',
      leaderboard: '',
    };

    if (groupedInsights.pipeline.length > 0) {
      texts.pipeline = groupedInsights.pipeline
        .map(i => `• ${i.summary}${i.userName ? ` — ${i.userName}` : ''} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
        .join('\n');
    } else {
      texts.pipeline = 'No pipeline movements during this period.';
    }

    if (groupedInsights.deals.length > 0) {
      texts.deals = `${totalDealsReferred} deal(s) referred during this period with a total estimated value of ${fmtAbbrevValue(totalReferredValue)}.\n\n` +
        groupedInsights.deals
          .map(i => `• ${i.summary} (${format(new Date(i.timestamp), 'MMM d, yyyy')})`)
          .join('\n');
    } else {
      texts.deals = 'No deals referred during this period.';
    }

    if (dealsBySource.length > 0) {
      texts.leaderboard = 'Top Referral Sources:\n' +
        dealsBySource.map((s, i) => `${i + 1}. ${s.name} — ${s.value} deal(s)`).join('\n');
    } else {
      texts.leaderboard = 'No referral data available for this period.';
    }

    return texts;
  }, [groupedInsights, totalDealsReferred, totalReferredValue, dealsBySource]);

  const [editedText, setEditedText] = useState<Record<SectionKey, string | null>>({
    pipeline: null, deals: null, leaderboard: null,
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
    if (!canExport) return;
    setExporting(true);
    try {
      const [barImg, pieImg] = await Promise.all([
        captureChartAsImage(barChartRef),
        captureChartAsImage(pieChartRef),
      ]);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentW = pageW - margin * 2;

      // Color palette
      const BG = [15, 20, 25] as const;        // #0f1419
      const CARD_BG = [30, 41, 59] as const;   // #1e293b
      const BORDER = [51, 65, 85] as const;    // #334155
      const TEXT_PRIMARY = [241, 245, 249] as const;  // #f1f5f9
      const TEXT_SECONDARY = [148, 163, 184] as const; // #94a3b8
      const TEXT_MUTED = [100, 116, 139] as const;    // #64748b
      const ACCENT_PURPLE = [139, 92, 246] as const;  // #8b5cf6
      const ACCENT_BLUE = [59, 130, 246] as const;    // #3b82f6
      const ACCENT_CYAN = [6, 182, 212] as const;     // #06b6d4
      const ACCENT_GREEN = [16, 185, 129] as const;   // #10b981
      const ACCENT_AMBER = [245, 158, 11] as const;   // #f59e0b

      const pages: (() => void)[] = [];
      let currentPage = 0;

      const fillBg = () => {
        doc.setFillColor(...BG);
        doc.rect(0, 0, pageW, pageH, 'F');
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`Generated by nAItive`, margin, pageH - 8);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
      };

      const drawCard = (x: number, y: number, w: number, h: number) => {
        doc.setFillColor(...CARD_BG);
        doc.roundedRect(x, y, w, h, 3, 3, 'F');
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, w, h, 3, 3, 'S');
      };

      const drawGradientLine = (x: number, y: number, w: number) => {
        // Purple to blue accent line
        const steps = 40;
        const stepW = w / steps;
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const r = Math.round(ACCENT_PURPLE[0] + (ACCENT_CYAN[0] - ACCENT_PURPLE[0]) * t);
          const g = Math.round(ACCENT_PURPLE[1] + (ACCENT_CYAN[1] - ACCENT_PURPLE[1]) * t);
          const b = Math.round(ACCENT_PURPLE[2] + (ACCENT_CYAN[2] - ACCENT_PURPLE[2]) * t);
          doc.setFillColor(r, g, b);
          doc.rect(x + i * stepW, y, stepW + 0.5, 0.8, 'F');
        }
      };

      let y = margin;

      const newPage = () => {
        doc.addPage();
        fillBg();
        y = margin;
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 18) {
          newPage();
        }
      };

      const addSectionHeader = (text: string) => {
        ensureSpace(18);
        doc.setFontSize(15);
        doc.setTextColor(...TEXT_PRIMARY);
        doc.text(text, margin, y);
        y += 2;
        drawGradientLine(margin, y, contentW);
        y += 8;
      };

      const addSubHeader = (text: string) => {
        ensureSpace(12);
        doc.setFontSize(11);
        doc.setTextColor(...ACCENT_BLUE);
        doc.text(text, margin, y);
        y += 6;
      };

      const addBodyText = (text: string, indent = 0) => {
        if (!text.trim()) return;
        doc.setFontSize(9.5);
        doc.setTextColor(...TEXT_SECONDARY);
        const lines = doc.splitTextToSize(text, contentW - indent);
        for (const line of lines) {
          if (y > pageH - 18) { newPage(); }
          doc.text(line, margin + indent, y);
          y += 4.5;
        }
        y += 2;
      };

      // ============================================
      // COVER PAGE
      // ============================================
      fillBg();

      // Gradient accent bar at top
      drawGradientLine(0, 0, pageW);
      doc.setFillColor(...ACCENT_PURPLE);
      doc.rect(0, 0, pageW, 1.5, 'F');

      // Title area
      const coverCenterY = pageH * 0.38;
      doc.setFontSize(36);
      doc.setTextColor(...TEXT_PRIMARY);
      doc.text('Partner Insights', margin, coverCenterY);
      doc.setFontSize(36);
      doc.setTextColor(...ACCENT_PURPLE);
      doc.text('Report', margin, coverCenterY + 14);

      // Gradient accent line under title
      drawGradientLine(margin, coverCenterY + 20, 60);

      // Date range
      doc.setFontSize(14);
      doc.setTextColor(...TEXT_SECONDARY);
      doc.text(`${format(dateFrom, 'MMMM d, yyyy')} — ${format(dateTo, 'MMMM d, yyyy')}`, margin, coverCenterY + 34);

      // Company name card
      const infoY = coverCenterY + 52;
      drawCard(margin, infoY, contentW, 36);
      doc.setFontSize(11);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('COMPANY', margin + 8, infoY + 10);
      doc.setFontSize(14);
      doc.setTextColor(...TEXT_PRIMARY);
      doc.text(company?.name || 'nAItive', margin + 8, infoY + 18);

      doc.setFontSize(11);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('GENERATED BY', margin + contentW / 2, infoY + 10);
      doc.setFontSize(14);
      doc.setTextColor(...TEXT_PRIMARY);
      const userName = (user as any)?.user_metadata?.display_name || user?.email || 'User';
      doc.text(userName, margin + contentW / 2, infoY + 18);

      doc.setFontSize(9);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(format(new Date(), 'MMMM d, yyyy · h:mm a'), margin + 8, infoY + 30);

      // Bottom gradient bar
      drawGradientLine(0, pageH - 2, pageW);

      // ============================================
      // PAGE 2: KEY METRICS + CHARTS
      // ============================================
      newPage();

      addSectionHeader('Key Metrics');

      // Metric cards in a row
      const metricData = [
        { label: 'Total Partners', value: partners.length.toString(), color: ACCENT_BLUE },
        { label: 'Partners Added', value: newPartnersCount.toString(), color: ACCENT_GREEN },
        { label: 'Deals Referred', value: totalDealsReferred.toString(), color: ACCENT_CYAN },
        { label: 'Referred Value', value: fmtAbbrevValue(totalReferredValue), color: ACCENT_AMBER },
        { label: 'Stage Movements', value: stageMovesCount.toString(), color: ACCENT_PURPLE },
      ];

      const cardW = (contentW - 4 * 3) / 5;
      const cardH = 28;
      metricData.forEach((m, i) => {
        const cx = margin + i * (cardW + 3);
        drawCard(cx, y, cardW, cardH);
        // Colored top accent
        doc.setFillColor(...m.color);
        doc.roundedRect(cx, y, cardW, 1.5, 1, 1, 'F');
        // Value
        doc.setFontSize(16);
        doc.setTextColor(...TEXT_PRIMARY);
        doc.text(m.value, cx + cardW / 2, y + 14, { align: 'center' });
        // Label
        doc.setFontSize(7);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(m.label, cx + cardW / 2, y + 22, { align: 'center' });
      });
      y += cardH + 10;

      // Bar chart
      if (barImg) {
        addSectionHeader('Partners by Stage');
        drawCard(margin, y, contentW, 62);
        doc.addImage(barImg, 'PNG', margin + 2, y + 2, contentW - 4, 58);
        y += 68;
      }

      // Donut chart
      if (pieImg && dealsBySource.length > 0) {
        ensureSpace(75);
        addSectionHeader('Deals by Referral Source');
        const imgW = contentW * 0.5;
        drawCard(margin, y, contentW, 62);
        doc.addImage(pieImg, 'PNG', margin + (contentW - imgW) / 2, y + 2, imgW, 58);
        y += 68;

        // Legend below chart
        const legendY = y;
        const legendX = margin + 4;
        dealsBySource.forEach((e, i) => {
          const lx = legendX + i * (contentW / dealsBySource.length);
          doc.setFillColor(parseInt(e.colorPair[0].slice(1, 3), 16), parseInt(e.colorPair[0].slice(3, 5), 16), parseInt(e.colorPair[0].slice(5, 7), 16));
          doc.roundedRect(lx, legendY - 3, 3, 3, 0.5, 0.5, 'F');
          doc.setFontSize(8);
          doc.setTextColor(...TEXT_SECONDARY);
          doc.text(`${e.name} (${e.value})`, lx + 5, legendY);
        });
        y += 8;
      }

      // ============================================
      // EXECUTIVE SUMMARY
      // ============================================
      if (execSummary.trim()) {
        ensureSpace(30);
        addSectionHeader('Executive Summary');
        drawCard(margin, y, contentW, 0); // Will draw after measuring
        const startY = y;
        y += 5;
        addBodyText(execSummary, 4);
        y += 3;
        const cardHeight = y - startY;
        // Redraw card with correct height
        doc.setFillColor(...CARD_BG);
        doc.roundedRect(margin, startY, contentW, cardHeight, 3, 3, 'F');
        doc.setDrawColor(...BORDER);
        doc.roundedRect(margin, startY, contentW, cardHeight, 3, 3, 'S');
        // Rewrite text on top of card
        y = startY + 5;
        addBodyText(execSummary, 4);
        y += 3;
      }

      // ============================================
      // SECTIONS
      // ============================================
      for (const section of SECTIONS) {
        if (!enabledSections.has(section.key)) continue;
        const content = getSectionContent(section.key);

        ensureSpace(30);
        addSectionHeader(section.label);

        if (section.key === 'deals' && groupedInsights.deals.length > 0) {
          // Formatted table for deals
          const dealRows = groupedInsights.deals.map(i => {
            const dateStr = format(new Date(i.timestamp), 'MMM d, yyyy');
            return [i.summary, dateStr];
          });
          autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['Deal', 'Date']],
            body: dealRows,
            headStyles: {
              fillColor: [CARD_BG[0], CARD_BG[1], CARD_BG[2]],
              textColor: [...ACCENT_BLUE],
              fontSize: 9,
              fontStyle: 'bold',
              lineColor: [...BORDER],
              lineWidth: 0.3,
            },
            bodyStyles: {
              fillColor: [BG[0], BG[1], BG[2]],
              textColor: [...TEXT_SECONDARY],
              fontSize: 8.5,
              lineColor: [...BORDER],
              lineWidth: 0.15,
            },
            alternateRowStyles: {
              fillColor: [CARD_BG[0], CARD_BG[1], CARD_BG[2]],
            },
            theme: 'grid',
            styles: { cellPadding: 3 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        } else if (section.key === 'leaderboard' && dealsBySource.length > 0) {
          // Medal leaderboard
          const medals = ['🥇', '🥈', '🥉'];
          dealsBySource.forEach((src, i) => {
            ensureSpace(12);
            drawCard(margin, y, contentW, 10);
            doc.setFontSize(9.5);
            doc.setTextColor(...TEXT_PRIMARY);
            const rank = i < 3 ? `${medals[i]} ` : `${i + 1}. `;
            doc.text(`${rank}${src.name}`, margin + 5, y + 6.5);
            doc.setTextColor(...ACCENT_CYAN);
            doc.text(`${src.value} deal${src.value !== 1 ? 's' : ''}`, pageW - margin - 5, y + 6.5, { align: 'right' });
            y += 12;
          });
          y += 4;
        } else {
          addBodyText(content);
        }

        const note = commentary[section.key];
        if (note?.trim()) {
          doc.setFontSize(8);
          doc.setTextColor(...ACCENT_PURPLE);
          doc.text('Commentary', margin, y);
          y += 4;
          doc.setFontSize(9);
          doc.setTextColor(...TEXT_MUTED);
          const noteLines = doc.splitTextToSize(note, contentW - 4);
          for (const line of noteLines) {
            if (y > pageH - 18) { newPage(); }
            doc.text(line, margin + 2, y);
            y += 4.5;
          }
          y += 4;
        }
      }

      // ============================================
      // SELECTED INSIGHTS
      // ============================================
      const selectedItems = allSelectableInsights.filter(i => selectedInsightIds.has(i.id));
      if (selectedItems.length > 0) {
        ensureSpace(20);
        addSectionHeader('Selected Insights');

        selectedItems.forEach((item, idx) => {
          ensureSpace(20);
          // Insight card
          const lines = doc.splitTextToSize(item.summary, contentW - 18);
          const lineH = 4.5;
          const insightNote = insightCommentary[item.id];
          const noteLines = insightNote?.trim() ? doc.splitTextToSize(insightNote, contentW - 22) : [];
          const totalH = 10 + lines.length * lineH + (noteLines.length > 0 ? 8 + noteLines.length * lineH : 0);

          drawCard(margin, y, contentW, totalH);

          // Number badge
          doc.setFillColor(...ACCENT_PURPLE);
          doc.roundedRect(margin + 4, y + 3, 6, 6, 1.5, 1.5, 'F');
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(`${idx + 1}`, margin + 7, y + 7.5, { align: 'center' });

          // Text
          doc.setFontSize(9.5);
          doc.setTextColor(...TEXT_PRIMARY);
          let ty = y + 7;
          for (const line of lines) {
            doc.text(line, margin + 14, ty);
            ty += lineH;
          }

          // Meta
          doc.setFontSize(7.5);
          doc.setTextColor(...TEXT_MUTED);
          const meta = `${item.userName ? `${item.userName} · ` : ''}${format(new Date(item.timestamp), 'MMM d, yyyy')}`;
          doc.text(meta, margin + 14, ty + 1);

          if (noteLines.length > 0) {
            ty += 5;
            doc.setFontSize(8);
            doc.setTextColor(...ACCENT_PURPLE);
            doc.text('Commentary:', margin + 14, ty);
            ty += 4;
            doc.setFontSize(8.5);
            doc.setTextColor(...TEXT_MUTED);
            for (const nl of noteLines) {
              doc.text(nl, margin + 16, ty);
              ty += lineH;
            }
          }

          y += totalH + 4;
        });
      }

      // ============================================
      // ADD PAGE NUMBERS TO ALL PAGES
      // ============================================
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      doc.save(`Partner_Insights_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const metricCards = [
    { label: 'Total Partners', value: partners.length, icon: Users, color: 'text-blue-400' },
    { label: 'Deals Referred', value: totalDealsReferred, icon: Handshake, color: 'text-green-400' },
    { label: 'Referred Value', value: fmtAbbrevValue(totalReferredValue), icon: DollarSign, color: 'text-amber-400' },
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
          {/* Date range with quick filter */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* Quick Filter */}
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={quickFilter} onValueChange={v => applyQuickFilter(v)}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue placeholder="Custom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Quarters</SelectLabel>
                    <SelectItem value="q1">Q1 (Jan – Mar)</SelectItem>
                    <SelectItem value="q2">Q2 (Apr – Jun)</SelectItem>
                    <SelectItem value="q3">Q3 (Jul – Sep)</SelectItem>
                    <SelectItem value="q4">Q4 (Oct – Dec)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Annual</SelectLabel>
                    <SelectItem value="full_year">Full Year</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Rolling</SelectLabel>
                    <SelectItem value="past_3m">Past 3 Months</SelectItem>
                    <SelectItem value="past_6m">Past 6 Months</SelectItem>
                    <SelectItem value="ttm">TTM (12 Months)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Manual</SelectLabel>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {/* Year selector — visible for quarter/annual presets */}
            {['q1', 'q2', 'q3', 'q4', 'full_year'].includes(quickFilter) && (
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Select value={filterYear.toString()} onValueChange={handleYearChange}>
                  <SelectTrigger className="w-[90px] h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* From */}
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[150px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateFrom, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={d => d && handleManualDateFrom(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {/* To */}
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn('w-[150px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateTo, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={d => d && handleManualDateTo(d)} className="p-3 pointer-events-auto" />
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

            {/* Donut chart — redesigned */}
            <div ref={pieChartRef} className="rounded-lg border border-border bg-card p-5 min-h-[280px] flex flex-col items-center">
              <p className="text-xs font-semibold text-muted-foreground mb-4 self-start">Deals by Referral Source</p>
              {dealsBySource.length > 0 ? (
                <>
                  <div className="relative" style={{ width: 200, height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          {dealsBySource.map((d, i) => (
                            <linearGradient key={i} id={`rpg-${i}`} x1="0" y1="0" x2="1" y2="1">
                              <stop offset="0%" stopColor={d.colorPair[0]} stopOpacity={1} />
                              <stop offset="100%" stopColor={d.colorPair[1]} stopOpacity={0.9} />
                            </linearGradient>
                          ))}
                        </defs>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [`${value} deal${value !== 1 ? 's' : ''}`, name]}
                        />
                        <Pie
                          data={dealsBySource}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {dealsBySource.map((_, i) => (
                            <Cell key={i} fill={`url(#rpg-${i})`} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold">{donutTotal}</span>
                      <span className="text-[10px] text-muted-foreground">deals</span>
                    </div>
                  </div>
                  {/* Legend below */}
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
                    {dealsBySource.map((e, i) => (
                      <div key={e.name} className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ background: `linear-gradient(135deg, ${e.colorPair[0]}, ${e.colorPair[1]})` }}
                        />
                        <span className="text-xs text-foreground">{e.name}</span>
                        <span className="text-xs text-muted-foreground">({e.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center flex-1 text-xs text-muted-foreground italic">
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

          {/* Insights Feed — selectable with 3-5 limit */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Insights Feed</h4>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                selectedCount < MIN_INSIGHTS
                  ? 'bg-destructive/20 text-destructive'
                  : selectedCount >= MAX_INSIGHTS
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-primary/20 text-primary'
              )}>
                Selected: {selectedCount}/{selectedCount < MIN_INSIGHTS ? `${MIN_INSIGHTS} minimum` : `${MAX_INSIGHTS} maximum`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Select {MIN_INSIGHTS}–{MAX_INSIGHTS} insights to include in the report. Each selected insight can have optional commentary.
            </p>

            {allSelectableInsights.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">No insights available for this period.</p>
            ) : (
              <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1">
                {allSelectableInsights.map(item => {
                  const isSelected = selectedInsightIds.has(item.id);
                  const isDisabled = !isSelected && selectedCount >= MAX_INSIGHTS;
                  return (
                    <div key={item.id} className={cn(
                      'rounded-lg border p-3 space-y-2 transition-colors',
                      isSelected ? 'border-primary/50 bg-primary/5' : 'border-border',
                      isDisabled && 'opacity-50'
                    )}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={() => toggleInsight(item.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">{item.summary}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {item.userName && `${item.userName} · `}
                            {format(new Date(item.timestamp), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </label>
                      {isSelected && (
                        <Textarea
                          placeholder="Optional commentary for this insight..."
                          value={insightCommentary[item.id] || ''}
                          onChange={e => setInsightCommentary(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="min-h-[40px] text-sm ml-7"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!canExport && selectedCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Select at least {MIN_INSIGHTS} insights to export
              </div>
            )}
          </div>

          {/* Export button */}
          <div className="flex items-center justify-end gap-3">
            {!canExport && (
              <span className="text-xs text-muted-foreground">
                Select at least {MIN_INSIGHTS} insights to export
              </span>
            )}
            <Button onClick={exportPDF} disabled={exporting || !canExport} className="gap-2">
              <FileDown className="h-4 w-4" />
              {exporting ? 'Generating...' : 'Export to PDF'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

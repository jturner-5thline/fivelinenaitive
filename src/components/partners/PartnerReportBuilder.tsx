import { useState, useMemo } from 'react';
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
import { LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractValueFromText(text: string): number {
  const match = text.match(/\$([\d,.]+)\s*(K|MM|M|B)?/i);
  if (!match) return 0;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'B') return amount * 1_000_000_000;
  if (suffix === 'MM' || suffix === 'M') return amount * 1_000_000;
  if (suffix === 'K') return amount * 1_000;
  return amount;
}

function extractReferralSourceName(text: string): string {
  const match = text.match(/referred by (.+)$/i);
  return match?.[1]?.trim() || 'Unknown';
}

// Donut color pairs are kept for the static PDF export (hex required for
// inline SVG/HTML gradient stops). In-app Recharts segments use the shared
// LIQUID_GLASS_SERIES palette to match Channels and the Insights page.
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
    return stages.map((s, idx) => ({
      name: s.name,
      count: countMap.get(s.id) || 0,
      color: LIQUID_GLASS_SERIES[idx % LIQUID_GLASS_SERIES.length],
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

  const pdfReferralSourceRows = useMemo(() => {
    const sourceMap = new Map<string, { name: string; count: number; value: number }>();

    groupedInsights.deals.forEach((item) => {
      const name = extractReferralSourceName(item.summary);
      const value = extractValueFromText(item.summary);
      const existing = sourceMap.get(name) ?? { name, count: 0, value: 0 };
      existing.count += 1;
      existing.value += value;
      sourceMap.set(name, existing);
    });

    const sorted = Array.from(sourceMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.value - a.value;
    });

    const top = sorted.slice(0, 5);
    const remainder = sorted.slice(5);
    if (remainder.length > 0) {
      top.push({
        name: 'Other',
        count: remainder.reduce((sum, item) => sum + item.count, 0),
        value: remainder.reduce((sum, item) => sum + item.value, 0),
      });
    }

    return top;
  }, [groupedInsights.deals]);

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

  const exportPDF = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidthPx = 794;
      const pageMinHeightPx = 1123;
      const background = '#1a1a2e';
      const cardBg = 'rgba(255,255,255,0.06)';
      const cardBorder = 'rgba(255,255,255,0.14)';
      const textPrimary = '#f8fafc';
      const textSecondary = '#cbd5e1';
      const textMuted = '#94a3b8';
      const accentPurple = '#8b5cf6';
      const accentBlue = '#3b82f6';
      const accentCyan = '#06b6d4';
      const accentGreen = '#10b981';
      const accentAmber = '#f59e0b';
      const userName = (user as any)?.user_metadata?.display_name || user?.email || 'User';

      const pageStyle = [
        `width:${pageWidthPx}px`,
        `min-height:${pageMinHeightPx}px`,
        'box-sizing:border-box',
        'position:relative',
        `padding:44px 44px 76px 44px`,
        `background-color:${background}`,
        `color:${textPrimary}`,
        'font-family:Arial, Helvetica, sans-serif',
        'page-break-after:always',
        'overflow:hidden',
      ].join(';');

      const sectionCardStyle = [
        `background-color:${cardBg}`,
        `border:1px solid ${cardBorder}`,
        'border-radius:18px',
        'padding:20px',
        'box-sizing:border-box',
      ].join(';');

      const gradientDivider = `background:linear-gradient(90deg, ${accentPurple} 0%, ${accentBlue} 55%, ${accentCyan} 100%);height:3px;border-radius:999px;width:100%;`;

      const renderTextBlock = (body: string, color = textSecondary) => {
        const lines = body
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          return `<div style="background-color:${background};color:${textMuted};font-size:13px;line-height:1.7;">No content provided.</div>`;
        }

        return lines
          .map(
            (line) => `<div style="background-color:${background};color:${color};font-size:13px;line-height:1.7;margin-bottom:8px;">${escapeHtml(line)}</div>`,
          )
          .join('');
      };

      const metricCardsHtml = [
        { label: 'Total Partners', value: partners.length.toString(), color: accentBlue },
        { label: 'Partners Added', value: newPartnersCount.toString(), color: accentGreen },
        { label: 'Deals Referred', value: totalDealsReferred.toString(), color: accentCyan },
        { label: 'Referred Value', value: fmtAbbrevValue(totalReferredValue), color: accentAmber },
        { label: 'Stage Movements', value: stageMovesCount.toString(), color: accentPurple },
      ]
        .map(
          (metric, index, arr) => `
            <div style="${sectionCardStyle};background-color:${cardBg};width:calc(20% - 10px);min-height:108px;display:inline-block;vertical-align:top;${index < arr.length - 1 ? 'margin-right:12px;' : ''}">
              <div style="background-color:${background};height:4px;border-radius:999px;margin-bottom:16px;background:${metric.color};"></div>
              <div style="background-color:${background};color:${textPrimary};font-size:28px;font-weight:700;text-align:center;margin-bottom:10px;">${escapeHtml(metric.value)}</div>
              <div style="background-color:${background};color:${textMuted};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;text-align:center;">${escapeHtml(metric.label)}</div>
            </div>`,
        )
        .join('');

      const maxStageCount = Math.max(...stageChartData.map((item) => item.count), 1);
      const stageBarsHtml = stageChartData.length
        ? stageChartData
            .map((stage) => {
              const width = Math.max((stage.count / maxStageCount) * 100, stage.count > 0 ? 8 : 0);
              const lighter = lighten(stage.color, 0.22);
              return `
                <div style="background-color:${background};margin-bottom:14px;">
                  <div style="background-color:${background};display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <div style="background-color:${background};color:${textPrimary};font-size:13px;font-weight:600;">${escapeHtml(stage.name)}</div>
                    <div style="background-color:${background};color:${textSecondary};font-size:13px;font-weight:700;">${stage.count}</div>
                  </div>
                  <div style="background-color:rgba(255,255,255,0.08);border-radius:999px;height:16px;overflow:hidden;">
                    <div style="height:16px;width:${width}%;border-radius:999px;background:linear-gradient(90deg, ${stage.color} 0%, ${lighter} 100%);"></div>
                  </div>
                </div>`;
            })
            .join('')
        : `<div style="background-color:${background};color:${textMuted};font-size:13px;">No stage data for this period.</div>`;

      const referralCircleColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b'];
      const referralTableRowsHtml = pdfReferralSourceRows.length
        ? pdfReferralSourceRows
            .map(
              (row, index) => `
                <tr style="background-color:${index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'};">
                  <td style="background-color:transparent;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="background-color:transparent;display:flex;align-items:center;gap:10px;">
                      <div style="width:12px;height:12px;border-radius:999px;background-color:${referralCircleColors[index % referralCircleColors.length]};"></div>
                      <span style="background-color:transparent;color:${textPrimary};font-size:13px;font-weight:600;">${escapeHtml(row.name)}</span>
                    </div>
                  </td>
                  <td style="background-color:transparent;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textSecondary};font-size:13px;text-align:right;font-weight:700;">${row.count}</td>
                  <td style="background-color:transparent;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textSecondary};font-size:13px;text-align:right;font-weight:700;">${escapeHtml(fmtAbbrevValue(row.value))}</td>
                </tr>`,
            )
            .join('')
        : `<tr><td colspan="3" style="background-color:${background};padding:18px;color:${textMuted};font-size:13px;text-align:center;">No referral data for this period.</td></tr>`;

      const leaderboardRowsHtml = pdfReferralSourceRows.length
        ? pdfReferralSourceRows
            .slice(0, 5)
            .map((row, index) => {
              const medalColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : 'rgba(255,255,255,0.18)';
              return `
                <div style="${sectionCardStyle};background-color:${cardBg};display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:14px 16px;">
                  <div style="background-color:transparent;display:flex;align-items:center;gap:12px;">
                    <div style="width:24px;height:24px;border-radius:999px;background-color:${medalColor};color:${background};font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;">${index + 1}</div>
                    <div style="background-color:transparent;color:${textPrimary};font-size:14px;font-weight:600;">${escapeHtml(row.name)}</div>
                  </div>
                  <div style="background-color:transparent;color:${textSecondary};font-size:13px;font-weight:700;">${row.count} deals · ${escapeHtml(fmtAbbrevValue(row.value))}</div>
                </div>`;
            })
            .join('')
        : `<div style="${sectionCardStyle};color:${textMuted};font-size:13px;">No leaderboard data for this period.</div>`;

      const dealTableRows = groupedInsights.deals.length
        ? groupedInsights.deals
            .map((item, index) => {
              const value = extractValueFromText(item.summary);
              const source = extractReferralSourceName(item.summary);
              return `
                <tr style="background-color:${index % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'};">
                  <td style="background-color:transparent;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textPrimary};font-size:12px;line-height:1.5;">${escapeHtml(item.summary)}</td>
                  <td style="background-color:transparent;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textSecondary};font-size:12px;text-align:right;white-space:nowrap;">${escapeHtml(source)}</td>
                  <td style="background-color:transparent;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textSecondary};font-size:12px;text-align:right;white-space:nowrap;">${escapeHtml(fmtAbbrevValue(value))}</td>
                  <td style="background-color:transparent;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:${textSecondary};font-size:12px;text-align:right;white-space:nowrap;">${format(new Date(item.timestamp), 'MMM d, yyyy')}</td>
                </tr>`;
            })
            .join('')
        : `<tr><td colspan="4" style="background-color:${background};padding:18px;color:${textMuted};font-size:13px;text-align:center;">No deals referred during this period.</td></tr>`;

      const selectedItems = allSelectableInsights.filter((item) => selectedInsightIds.has(item.id));
      const selectedInsightsHtml = selectedItems.length
        ? selectedItems
            .map(
              (item, index) => `
                <div style="${sectionCardStyle};margin-bottom:14px;">
                  <div style="background-color:transparent;display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:28px;height:28px;border-radius:999px;background-color:${accentPurple};display:flex;align-items:center;justify-content:center;color:${textPrimary};font-size:13px;font-weight:700;">${index + 1}</div>
                    <div style="background-color:transparent;color:${textPrimary};font-size:15px;font-weight:700;">Selected Insight</div>
                  </div>
                  <div style="background-color:${background};color:${textSecondary};font-size:13px;line-height:1.7;margin-bottom:10px;">${escapeHtml(item.summary)}</div>
                  <div style="background-color:${background};color:${textMuted};font-size:11px;margin-bottom:${insightCommentary[item.id]?.trim() ? '12px' : '0'};">${escapeHtml(`${item.userName ? `${item.userName} · ` : ''}${format(new Date(item.timestamp), 'MMM d, yyyy')}`)}</div>
                  ${insightCommentary[item.id]?.trim() ? `<div style="background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px;"><div style="background-color:transparent;color:${accentCyan};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Commentary</div><div style="background-color:transparent;color:${textSecondary};font-size:12px;line-height:1.7;">${escapeHtml(insightCommentary[item.id])}</div></div>` : ''}
                </div>`,
            )
            .join('')
        : `<div style="${sectionCardStyle};color:${textMuted};font-size:13px;">No insights selected.</div>`;

      const enabledSectionBlocks = SECTIONS.filter((section) => enabledSections.has(section.key)).map((section) => {
        const commentaryBlock = commentary[section.key]?.trim()
          ? `
            <div style="${sectionCardStyle};margin-top:16px;">
              <div style="background-color:${background};color:${accentCyan};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Commentary</div>
              ${renderTextBlock(commentary[section.key])}
            </div>`
          : '';

        if (section.key === 'deals') {
          return `
            <div style="${pageStyle}">
              <div style="background-color:${background};font-size:28px;font-weight:800;margin-bottom:10px;">${escapeHtml(section.label)}</div>
              <div style="${gradientDivider};margin-bottom:22px;"></div>
              <div style="${sectionCardStyle};margin-bottom:16px;">${renderTextBlock(getSectionContent(section.key))}</div>
              <div style="${sectionCardStyle};">
                <div style="background-color:${background};color:${textPrimary};font-size:15px;font-weight:700;margin-bottom:14px;">Referred Deals</div>
                <table style="width:100%;border-collapse:collapse;background-color:${background};">
                  <thead>
                    <tr style="background-color:rgba(255,255,255,0.08);">
                      <th style="background-color:transparent;padding:12px;text-align:left;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Deal</th>
                      <th style="background-color:transparent;padding:12px;text-align:right;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Source</th>
                      <th style="background-color:transparent;padding:12px;text-align:right;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Value</th>
                      <th style="background-color:transparent;padding:12px;text-align:right;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Date</th>
                    </tr>
                  </thead>
                  <tbody style="background-color:${background};">${dealTableRows}</tbody>
                </table>
              </div>
              ${commentaryBlock}
            </div>`;
        }

        if (section.key === 'leaderboard') {
          return `
            <div style="${pageStyle}">
              <div style="background-color:${background};font-size:28px;font-weight:800;margin-bottom:10px;">${escapeHtml(section.label)}</div>
              <div style="${gradientDivider};margin-bottom:22px;"></div>
              <div style="${sectionCardStyle};margin-bottom:16px;">${renderTextBlock(getSectionContent(section.key))}</div>
              ${leaderboardRowsHtml}
              ${commentaryBlock}
            </div>`;
        }

        return `
          <div style="${pageStyle}">
            <div style="background-color:${background};font-size:28px;font-weight:800;margin-bottom:10px;">${escapeHtml(section.label)}</div>
            <div style="${gradientDivider};margin-bottom:22px;"></div>
            <div style="${sectionCardStyle};">${renderTextBlock(getSectionContent(section.key))}</div>
            ${commentaryBlock}
          </div>`;
      });

      const pages = [
        `
          <div style="${pageStyle}">
            <div style="background:linear-gradient(90deg, ${accentPurple} 0%, ${accentBlue} 55%, ${accentCyan} 100%);height:6px;border-radius:999px;margin-bottom:84px;"></div>
            <div style="background-color:${background};margin-top:180px;">
              <div style="background-color:${background};color:${textMuted};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:18px;">5th Line</div>
              <div style="background-color:${background};color:${textPrimary};font-size:44px;font-weight:800;line-height:1.05;">Partner Insights</div>
              <div style="background-color:${background};color:${accentPurple};font-size:44px;font-weight:800;line-height:1.05;margin-bottom:18px;">Report</div>
              <div style="width:180px;${gradientDivider};margin-bottom:28px;"></div>
              <div style="background-color:${background};color:${textSecondary};font-size:16px;margin-bottom:36px;">${escapeHtml(`${format(dateFrom, 'MMMM d, yyyy')} — ${format(dateTo, 'MMMM d, yyyy')}`)}</div>
            </div>
            <div style="${sectionCardStyle};display:flex;justify-content:space-between;gap:18px;">
              <div style="background-color:transparent;flex:1;">
                <div style="background-color:${background};color:${textMuted};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Company</div>
                <div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;">${escapeHtml(company?.name || '5th Line')}</div>
              </div>
              <div style="background-color:transparent;flex:1;">
                <div style="background-color:${background};color:${textMuted};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Generated By</div>
                <div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;">${escapeHtml(userName)}</div>
              </div>
              <div style="background-color:transparent;flex:1;">
                <div style="background-color:${background};color:${textMuted};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Generated On</div>
                <div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;">${escapeHtml(format(new Date(), 'MMM d, yyyy'))}</div>
              </div>
            </div>
          </div>`,
        `
          <div style="${pageStyle}">
            <div style="background-color:${background};font-size:28px;font-weight:800;margin-bottom:10px;">Key Metrics</div>
            <div style="${gradientDivider};margin-bottom:24px;"></div>
            <div style="background-color:${background};white-space:nowrap;margin-bottom:24px;">${metricCardsHtml}</div>
            <div style="${sectionCardStyle};margin-bottom:18px;">
              <div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;margin-bottom:14px;">Partners by Stage</div>
              ${stageBarsHtml}
            </div>
            <div style="${sectionCardStyle};margin-bottom:${execSummary.trim() ? '18px' : '0'};">
              <div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;margin-bottom:14px;">Deals by Referral Source</div>
              <table style="width:100%;border-collapse:collapse;background-color:${background};">
                <thead>
                  <tr style="background-color:rgba(255,255,255,0.08);">
                    <th style="background-color:transparent;padding:12px 14px;text-align:left;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Source</th>
                    <th style="background-color:transparent;padding:12px 14px;text-align:right;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Deals</th>
                    <th style="background-color:transparent;padding:12px 14px;text-align:right;color:${accentBlue};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Value</th>
                  </tr>
                </thead>
                <tbody style="background-color:${background};">${referralTableRowsHtml}</tbody>
              </table>
            </div>
            ${execSummary.trim() ? `<div style="${sectionCardStyle};margin-top:18px;"><div style="background-color:${background};color:${textPrimary};font-size:18px;font-weight:700;margin-bottom:14px;">Executive Summary</div>${renderTextBlock(execSummary)}</div>` : ''}
          </div>`,
        ...enabledSectionBlocks,
        `
          <div style="${pageStyle};page-break-after:auto;">
            <div style="background-color:${background};font-size:28px;font-weight:800;margin-bottom:10px;">Selected Insights</div>
            <div style="${gradientDivider};margin-bottom:22px;"></div>
            ${selectedInsightsHtml}
          </div>`,
      ];

      const totalPages = pages.length;
      const pagesWithFooters = pages.map((pageHtml, index) =>
        pageHtml.replace(/<\/div>\s*$/, `<div style="background-color:${background};position:absolute;left:44px;right:44px;bottom:28px;display:flex;justify-content:space-between;align-items:center;color:${textMuted};font-size:11px;"><div style="background-color:${background};">Generated by naitive</div><div style="background-color:${background};">Page ${index + 1} of ${totalPages}</div></div></div>`),
      );

      const container = document.createElement('div');
      container.setAttribute('style', `position:fixed;left:-100000px;top:0;width:${pageWidthPx}px;background-color:${background};padding:0;margin:0;`);
      container.innerHTML = `<div style="width:${pageWidthPx}px;background-color:${background};">${pagesWithFooters.join('')}</div>`;
      document.body.appendChild(container);

      try {
        await doc.html(container, {
          x: 0,
          y: 0,
          margin: [0, 0, 0, 0],
          autoPaging: 'text',
          width: 210,
          windowWidth: pageWidthPx,
          html2canvas: {
            backgroundColor: background,
            scale: 1,
            useCORS: true,
          },
        });
      } finally {
        document.body.removeChild(container);
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
            <div className="rounded-lg border border-border bg-card p-4 min-h-[220px]">
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
            <div className="rounded-lg border border-border bg-card p-5 min-h-[280px] flex flex-col items-center">
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

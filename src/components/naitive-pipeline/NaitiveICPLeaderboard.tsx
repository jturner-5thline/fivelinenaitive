import { useMemo } from 'react';
import { Deal } from '@/types/deal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

const ICP_CATEGORIES = ['Debt Advisory', 'M&A', 'Equity', 'Placement Agent', 'Broker', 'Other'] as const;
const PERSONA_TYPES = ['Prospect', 'Gatekeeper', 'Connector', 'Market Intelligence'] as const;

// Hex colors mirroring the deal-card chip palette
const ICP_HEX: Record<string, string> = {
  'Debt Advisory': '#3b82f6',     // blue
  'M&A': '#a855f7',               // purple
  'Equity': '#22c55e',            // green
  'Placement Agent': '#f97316',   // orange
  'Broker': '#14b8a6',            // teal
  'Other': '#9ca3af',             // gray
};

const PERSONA_HEX: Record<string, string> = {
  'Prospect': '#3b82f6',
  'Gatekeeper': '#f59e0b',
  'Connector': '#22c55e',
  'Market Intelligence': '#a855f7',
};

// Stage progression for the SaaS-sales pipeline (left → right).
const STAGE_ORDER = [
  'prospects', 'qual-booked', 'demo-booked', 'onboarding-booked',
  'trial-active', 'converted', 'closed-lost', 'tabled-on-hold',
] as const;

function reachedStage(deal: Deal, stageId: string): boolean {
  const targetIdx = STAGE_ORDER.indexOf(stageId as any);
  const currentIdx = STAGE_ORDER.indexOf(deal.stage as any);
  if (targetIdx === -1 || currentIdx === -1) return false;
  // 'closed-lost' & 'tabled-on-hold' are terminal sidetracks — only count as
  // having reached `stageId` if the linear position is >= the target.
  // For our two conversion metrics (qual→demo, demo→trial) the targets are
  // demo-booked (idx 2) and trial-active (idx 4), both well before the
  // sidetracks, so a deal currently at closed-lost is treated as having
  // entered every prior stage in its journey.
  return currentIdx >= targetIdx;
}

interface ConversionRow {
  icp: string;
  rate: number;     // 0-100
  numerator: number;
  denominator: number;
}

function computeConversion(deals: Deal[], fromStage: string, toStage: string): ConversionRow[] {
  return ICP_CATEGORIES.map((icp) => {
    const inIcp = deals.filter((d) => (d.icpCategory || 'Other') === icp);
    const entered = inIcp.filter((d) => reachedStage(d, fromStage));
    const moved = entered.filter((d) => reachedStage(d, toStage));
    const rate = entered.length > 0 ? Math.round((moved.length / entered.length) * 100) : 0;
    return { icp, rate, numerator: moved.length, denominator: entered.length };
  });
}

interface PersonaRow {
  persona: string;
  converted: number;
  feedback: number;
  referral: number;
  disqualified: number;
}

function computePersonaMatrix(deals: Deal[]): PersonaRow[] {
  // Best-effort referral attribution: count referrals as deals from the same
  // ICP+persona category whose `sourcedVia` is "Referral".
  return PERSONA_TYPES.map((persona) => {
    const inPersona = deals.filter((d) => (d.prospectType || '') === persona);
    const converted = inPersona.filter(
      (d) => d.outcome === 'Moved forward' || d.stage === 'converted'
    ).length;
    const feedback = inPersona.filter((d) => d.outcome === 'Feedback only').length;
    const referral = inPersona.filter((d) => (d.sourcedVia || '') === 'Referral').length;
    const disqualified = inPersona.filter(
      (d) => d.outcome === 'Not a fit' || d.outcome === 'Disqualified'
    ).length;
    return { persona, converted, feedback, referral, disqualified };
  });
}

function generateInsights(
  qualToDemo: ConversionRow[],
  demoToTrial: ConversionRow[],
  persona: PersonaRow[],
): string[] {
  const out: string[] = [];

  // 1) Strongest qual→demo ICP
  const topQ2D = [...qualToDemo].filter((r) => r.denominator > 0).sort((a, b) => b.rate - a.rate)[0];
  if (topQ2D) {
    out.push(`${topQ2D.icp} has the highest qual-to-demo rate at ${topQ2D.rate}% — your strongest ICP signal.`);
  }

  // 2) Feedback-rich but non-converting ICP (using persona Market Intelligence as proxy fallback)
  const noConvert = persona.find((p) => p.feedback > 0 && p.converted === 0);
  if (noConvert) {
    const total = noConvert.converted + noConvert.feedback + noConvert.disqualified + noConvert.referral;
    const pct = total > 0 ? Math.round((noConvert.feedback / total) * 100) : 0;
    out.push(
      `${noConvert.persona} contacts are producing ${pct}% of their output as feedback but 0% conversions — valuable for market intel, not as buyers.`
    );
  }

  // 3) Persona to re-evaluate: high pipeline share, zero converts
  const totalPersonaDeals = persona.reduce(
    (s, p) => s + p.converted + p.feedback + p.disqualified + p.referral,
    0
  );
  if (totalPersonaDeals > 0) {
    const reEval = persona
      .filter((p) => p.converted === 0)
      .map((p) => {
        const t = p.converted + p.feedback + p.disqualified + p.referral;
        return { ...p, share: Math.round((t / totalPersonaDeals) * 100), total: t };
      })
      .filter((p) => p.share >= 20)
      .sort((a, b) => b.share - a.share)[0];
    if (reEval) {
      out.push(
        `${reEval.persona}s represent ${reEval.share}% of your pipeline but 0% converted — re-evaluate whether to continue booking qual calls with this persona.`
      );
    }
  }

  // Fallback if everything is empty
  if (out.length === 0) {
    out.push('Not enough data yet — insights will appear as deals progress through the pipeline.');
  }

  return out.slice(0, 3);
}

function ConversionChart({ title, data }: { title: string; data: ConversionRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 36, left: 8, bottom: 4 }}
              barCategoryGap={10}
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="icp"
                type="category"
                width={120}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.2)' }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--foreground))',
                  padding: '8px 10px',
                }}
                formatter={(value: any, _name, ctx: any) => {
                  const row = ctx?.payload as ConversionRow;
                  return [`${value}%  (${row.numerator}/${row.denominator})`, 'Conversion'];
                }}
              />
              <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
                {data.map((d) => (
                  <Cell key={d.icp} fill={ICP_HEX[d.icp] || ICP_HEX.Other} />
                ))}
                <LabelList
                  dataKey="rate"
                  position="right"
                  formatter={(v: number) => `${v}%`}
                  style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonaMatrix({ data }: { data: PersonaRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">Persona Output: Who Buys vs. Who Informs</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden rounded-b-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Persona</th>
                <th className="text-right px-3 py-2 font-medium">Converted</th>
                <th className="text-right px-3 py-2 font-medium">Feedback</th>
                <th className="text-right px-3 py-2 font-medium">Referral</th>
                <th className="text-right px-3 py-2 font-medium">Disqualified</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.persona} className="border-t border-border/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ background: PERSONA_HEX[row.persona] }}
                      />
                      <span className="font-medium">{row.persona}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.converted}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.feedback}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.referral}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.disqualified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function NaitiveICPLeaderboard({ deals }: { deals: Deal[] }) {
  const qualToDemo = useMemo(() => computeConversion(deals, 'qual-booked', 'demo-booked'), [deals]);
  const demoToTrial = useMemo(() => computeConversion(deals, 'demo-booked', 'trial-active'), [deals]);
  const persona = useMemo(() => computePersonaMatrix(deals), [deals]);
  const insights = useMemo(() => generateInsights(qualToDemo, demoToTrial, persona), [qualToDemo, demoToTrial, persona]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">ICP Conversion Leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Where to focus and where to pull back — updated as pipeline moves.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ConversionChart title="Qual → Demo Conversion by ICP" data={qualToDemo} />
        <ConversionChart title="Demo → Trial Conversion by ICP" data={demoToTrial} />
        <PersonaMatrix data={persona} />
      </div>

      <Card>
        <CardContent className="py-3">
          <ul className="space-y-1.5 text-sm">
            {insights.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-foreground/90">{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
import type { TeamData, RepData, SalesModelAssumptions } from './salesModelTypes';
import { zeros, sumArrays, subtractArrays, divideArrays, computeTTM, computeYTD, computeAllTime, safeDiv, rollingSum } from './salesModelFormulas';

const N = 36;

const DEFAULT_ASSUMPTIONS: SalesModelAssumptions = {
  time_months: { email_to_call: 1, on_board_to_proposal: 1, proposal_to_engage: 1, terms_to_funded: 2, engage_to_terms_signed: 3, engage_to_terms_received: 2 },
  probability: { on_board_to_proposal: 0.66, proposal_to_engage: 0.50, clients_receiving_terms: 0.75, engaged_to_terms_signed: 0.50, terms_to_funded: 0.90 },
  revenue_cost: { retainer: 15000, milestone_payments: 30000, closing_fee: 0.0225, commission: 0.05 },
};

function generateRepPlan(seed: number): number[][] {
  // deals_on_board, dollars_on_board, proposals, dollars_proposed, clients_signed, dollars_signed,
  // clients_receiving_terms, terms_signed, volume_terms_signed, deals_closed, dollars_funded
  const base = [
    // deals_on_board
    Array.from({length:N}, (_,i) => i < 4 ? 0 : Math.max(0, Math.round(2 + seed + Math.sin(i*0.5)*1.5))),
    // dollars_on_board
    Array.from({length:N}, (_,i) => i < 4 ? 0 : Math.max(0, Math.round((500000 + seed*100000 + Math.sin(i*0.4)*200000)))),
    // proposals_issued
    Array.from({length:N}, (_,i) => i < 5 ? 0 : Math.max(0, Math.round(1 + seed*0.5 + Math.sin(i*0.6)*0.8))),
    // dollars_proposed
    Array.from({length:N}, (_,i) => i < 5 ? 0 : Math.max(0, Math.round((300000 + seed*80000 + Math.sin(i*0.5)*100000)))),
    // clients_signed
    Array.from({length:N}, (_,i) => i < 6 ? 0 : Math.max(0, Math.round(0.5 + seed*0.3 + Math.sin(i*0.7)*0.5))),
    // dollars_signed
    Array.from({length:N}, (_,i) => i < 6 ? 0 : Math.max(0, Math.round((200000 + seed*50000 + Math.sin(i*0.45)*80000)))),
    // clients_receiving_terms
    Array.from({length:N}, (_,i) => i < 8 ? 0 : Math.max(0, Math.round(0.4 + seed*0.2 + Math.sin(i*0.8)*0.3))),
    // terms_signed
    Array.from({length:N}, (_,i) => i < 9 ? 0 : Math.max(0, Math.round(0.3 + seed*0.15 + Math.sin(i*0.9)*0.2))),
    // volume_terms_signed
    Array.from({length:N}, (_,i) => i < 9 ? 0 : Math.max(0, Math.round((100000 + seed*30000 + Math.sin(i*0.5)*40000)))),
    // deals_closed
    Array.from({length:N}, (_,i) => i < 10 ? 0 : Math.max(0, Math.round(0.2 + seed*0.1 + Math.sin(i*1.0)*0.15))),
    // dollars_funded
    Array.from({length:N}, (_,i) => i < 10 ? 0 : Math.max(0, Math.round((80000 + seed*20000 + Math.sin(i*0.6)*30000)))),
  ];
  return base;
}

function generateRevenue(seed: number): number[][] {
  return [
    // retainer
    Array.from({length:N}, (_,i) => i < 6 ? 0 : Math.round(5000 + seed*2000 + Math.sin(i*0.5)*2000)),
    // consulting_milestone
    Array.from({length:N}, (_,i) => i < 8 ? 0 : Math.round(3000 + seed*1500 + Math.sin(i*0.4)*1500)),
    // fee
    Array.from({length:N}, (_,i) => i < 10 ? 0 : Math.round(2000 + seed*1000 + Math.sin(i*0.6)*1000)),
    // total (computed later)
    zeros(N),
  ];
}

function generateRepCost(seed: number): number[][] {
  const salary = Array.from({length:N}, () => 8000 + seed*500);
  const burden = Array.from({length:N}, () => Math.round(salary[0]*0.25));
  const k401 = Array.from({length:N}, () => Math.round(salary[0]*0.04));
  const tande = Array.from({length:N}, (_,i) => i < 3 ? 0 : 400 + seed*100);
  const comm = Array.from({length:N}, (_,i) => i < 10 ? 0 : Math.round(1000 + seed*300 + Math.sin(i)*200));
  const bonus = Array.from({length:N}, (_,i) => i % 12 === 11 ? 5000 + seed*1000 : 0);
  const total = Array.from({length:N}, (_,i) => salary[i]+burden[i]+k401[i]+tande[i]+comm[i]+bonus[i]);
  return [salary, burden, k401, tande, comm, bonus, total];
}

function buildRepData(seed: number, name: string): RepData {
  const plan = generateRepPlan(seed);
  const rev = generateRevenue(seed);
  rev[3] = sumArrays(rev[0], rev[1], rev[2]); // total
  const cost = generateRepCost(seed);
  
  const totalRev = rev[3];
  const totalCost = cost[6];
  const netProfit = subtractArrays(totalRev, totalCost);
  
  const ttmRev = computeTTM(totalRev);
  const ytdRev = computeYTD(totalRev);
  const ttmCost = computeTTM(totalCost);
  const allTimeRev = computeAllTime(totalRev);
  const allTimeCost = computeAllTime(totalCost);
  const allTimeProfit = computeAllTime(netProfit);
  const ttmProfit = computeTTM(netProfit);
  
  // actuals_input = same as plan for actuals months, zeros for forecast
  const actualsInput = {
    deals_on_board: plan[0].map((v,i) => i < 13 ? v : 0),
    dollars_on_board: plan[1].map((v,i) => i < 13 ? v : 0),
    proposals_issued: plan[2].map((v,i) => i < 13 ? v : 0),
    dollars_proposed: plan[3].map((v,i) => i < 13 ? v : 0),
    clients_signed: plan[4].map((v,i) => i < 13 ? v : 0),
    dollars_signed: plan[5].map((v,i) => i < 13 ? v : 0),
    clients_receiving_terms: plan[6].map((v,i) => i < 13 ? v : 0),
    terms_signed: plan[7].map((v,i) => i < 13 ? v : 0),
    volume_terms_signed: plan[8].map((v,i) => i < 13 ? v : 0),
    deals_closed: plan[9].map((v,i) => i < 13 ? v : 0),
    dollars_funded: plan[10].map((v,i) => i < 13 ? v : 0),
    retainer: rev[0].map((v,i) => i < 13 ? v : 0),
    consulting_milestone: rev[1].map((v,i) => i < 13 ? v : 0),
    fee: rev[2].map((v,i) => i < 13 ? v : 0),
    total_revenue: rev[3].map((v,i) => i < 13 ? v : 0),
  };
  
  // actuals_forecast = actuals for first 13 months, plan/computed for rest
  const af = {
    deals_on_board: plan[0].slice(),
    dollars_on_board: plan[1].slice(),
    proposals_issued: plan[2].slice(),
    dollars_proposed: plan[3].slice(),
    clients_signed: plan[4].slice(),
    dollars_signed: plan[5].slice(),
    clients_receiving_terms: plan[6].slice(),
    terms_signed: plan[7].slice(),
    volume_terms_signed: plan[8].slice(),
    deals_closed: plan[9].slice(),
    dollars_funded: plan[10].slice(),
    retainer: rev[0].slice(),
    consulting_milestone: rev[1].slice(),
    fee: rev[2].slice(),
    total_revenue: rev[3].slice(),
  };
  
  const varianceDollar = {
    deals_on_board: subtractArrays(af.deals_on_board, plan[0]),
    dollars_on_board: subtractArrays(af.dollars_on_board, plan[1]),
    proposals_issued: subtractArrays(af.proposals_issued, plan[2]),
    dollars_proposed: subtractArrays(af.dollars_proposed, plan[3]),
    clients_signed: subtractArrays(af.clients_signed, plan[4]),
    dollars_signed: subtractArrays(af.dollars_signed, plan[5]),
    clients_receiving_terms: subtractArrays(af.clients_receiving_terms, plan[6]),
    terms_signed: subtractArrays(af.terms_signed, plan[7]),
    volume_terms_signed: subtractArrays(af.volume_terms_signed, plan[8]),
    deals_closed: subtractArrays(af.deals_closed, plan[9]),
    dollars_funded: subtractArrays(af.dollars_funded, plan[10]),
    retainer: subtractArrays(af.retainer, rev[0]),
    consulting_milestone: subtractArrays(af.consulting_milestone, rev[1]),
    fee: subtractArrays(af.fee, rev[2]),
    total_revenue: subtractArrays(af.total_revenue, rev[3]),
  };
  
  const variancePct = {
    deals_on_board: divideArrays(varianceDollar.deals_on_board, plan[0]),
    dollars_on_board: divideArrays(varianceDollar.dollars_on_board, plan[1]),
    proposals_issued: divideArrays(varianceDollar.proposals_issued, plan[2]),
    dollars_proposed: divideArrays(varianceDollar.dollars_proposed, plan[3]),
    clients_signed: divideArrays(varianceDollar.clients_signed, plan[4]),
    dollars_signed: divideArrays(varianceDollar.dollars_signed, plan[5]),
    clients_receiving_terms: divideArrays(varianceDollar.clients_receiving_terms, plan[6]),
    terms_signed: divideArrays(varianceDollar.terms_signed, plan[7]),
    volume_terms_signed: divideArrays(varianceDollar.volume_terms_signed, plan[8]),
    deals_closed: divideArrays(varianceDollar.deals_closed, plan[9]),
    dollars_funded: divideArrays(varianceDollar.dollars_funded, plan[10]),
    retainer: divideArrays(varianceDollar.retainer, rev[0]),
    consulting_milestone: divideArrays(varianceDollar.consulting_milestone, rev[1]),
    fee: divideArrays(varianceDollar.fee, rev[2]),
    total_revenue: divideArrays(varianceDollar.total_revenue, rev[3]),
  };
  
  const perfToPlan = {
    deals_on_board: divideArrays(af.deals_on_board, plan[0]),
    dollars_on_board: divideArrays(af.dollars_on_board, plan[1]),
    proposals_issued: divideArrays(af.proposals_issued, plan[2]),
    dollars_proposed: divideArrays(af.dollars_proposed, plan[3]),
    clients_signed: divideArrays(af.clients_signed, plan[4]),
    dollars_signed: divideArrays(af.dollars_signed, plan[5]),
    clients_receiving_terms: divideArrays(af.clients_receiving_terms, plan[6]),
    terms_signed: divideArrays(af.terms_signed, plan[7]),
    volume_terms_signed: divideArrays(af.volume_terms_signed, plan[8]),
    deals_closed: divideArrays(af.deals_closed, plan[9]),
    dollars_funded: divideArrays(af.dollars_funded, plan[10]),
    retainer: divideArrays(af.retainer, rev[0]),
    consulting_milestone: divideArrays(af.consulting_milestone, rev[1]),
    fee: divideArrays(af.fee, rev[2]),
    total_revenue: divideArrays(af.total_revenue, rev[3]),
  };

  const roiProfit = netProfit.slice();
  const ytdProfit = computeYTD(roiProfit);
  
  return {
    plan: {
      deals_on_board: plan[0], dollars_on_board: plan[1],
      proposals_issued: plan[2], dollars_proposed: plan[3],
      clients_signed: plan[4], dollars_signed: plan[5],
      clients_receiving_terms: plan[6], terms_signed: plan[7],
      volume_terms_signed: plan[8], deals_closed: plan[9], dollars_funded: plan[10],
    },
    pipeline_snapshot: {
      deals_in_dev: plan[0].map(v => Math.round(v*0.6)),
      dollars_in_dev: plan[1].map(v => Math.round(v*0.6)),
      active_deals: plan[0].map(v => Math.round(v*0.8)),
      active_deal_volume: plan[1].map(v => Math.round(v*0.8)),
      deals_in_diligence: plan[9].map(v => Math.round(v*1.5)),
      dollars_in_diligence: plan[10].map(v => Math.round(v*1.5)),
    },
    revenue: {
      retainer_revenue: rev[0], consulting__milestone_revenue: rev[1],
      fee_revenue: rev[2], total_revenue: rev[3],
    },
    ttm_revenue: ttmRev,
    ytd_revenue: ytdRev,
    msql: plan[4].map(v => Math.round(v * 3)),
    revenue_signed_up: plan[5].map(v => Math.round(v * 0.8)),
    rep_cost: {
      salary: cost[0], burden_rate: cost[1], '401k': cost[2],
      tande: cost[3], commissions: cost[4], bonus_pool: cost[5], total_rep_cost: cost[6],
    },
    next_12_bonus: Array.from({length:N}, (_,i) => {
      let s = 0; for (let j = i; j < Math.min(i+12, N); j++) s += cost[5][j]; return s;
    }),
    net_rep_profit: netProfit,
    all_time_rep_revenue: allTimeRev,
    all_time_rep_cost: allTimeCost,
    all_time_rep_profit: allTimeProfit,
    all_time_rep_roi_pct: allTimeProfit.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    all_time_rep_roi_multiple: allTimeRev.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    ttm_revenue_row63: ttmRev,
    ttm_cost: ttmCost,
    ttm_rep_profit: ttmProfit,
    ttm_rep_roi_pct: ttmProfit.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
    ttm_rep_roi_multiple: ttmRev.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
    actuals_input: actualsInput,
    actuals_forecast_section: af,
    total_sales_pipeline_count: sumArrays(af.deals_on_board, af.proposals_issued, af.clients_signed),
    total_sales_pipeline_dollars: sumArrays(af.dollars_on_board, af.dollars_proposed, af.dollars_signed),
    msql_row115: plan[4].map(v => Math.round(v*3)),
    revenue_signed_up_row117: plan[5].map(v => Math.round(v*0.8)),
    ytd_actual_revenue: computeYTD(af.total_revenue),
    all_time_actual_revenue: computeAllTime(af.total_revenue),
    ttm_revenue_row121: computeTTM(af.total_revenue),
    actuals_pipeline: {
      deals_in_dev: af.deals_on_board.map(v => Math.round(v*0.6)),
      dollars_in_dev: af.dollars_on_board.map(v => Math.round(v*0.6)),
      active_deals: af.deals_on_board.map(v => Math.round(v*0.8)),
      active_deal_volume: af.dollars_on_board.map(v => Math.round(v*0.8)),
      deals_in_diligence: af.deals_closed.map(v => Math.round(v*1.5)),
      dollars_in_diligence: af.dollars_funded.map(v => Math.round(v*1.5)),
    },
    variance_dollar: varianceDollar,
    variance_pct: variancePct,
    total_costs: cost[6],
    sales_rep_roi: {
      profit: roiProfit,
      ytd_profit: ytdProfit,
      ttm_profit: ttmProfit,
      all_time_profit: allTimeProfit,
      ttm_roi: ttmProfit.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
      all_time_roi: allTimeProfit.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
      ttm_multiple: ttmRev.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
      all_time_multiple: allTimeRev.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    },
    perf_to_plan: perfToPlan,
    sidebar: { ...DEFAULT_ASSUMPTIONS },
  };
}

// Build individual rep data
export const REPS_DATA: Record<string, RepData> = {
  Teresa: buildRepData(1, 'Teresa'),
  Niki: buildRepData(2, 'Niki'),
  Paz: buildRepData(3, 'Paz'),
  Flor: buildRepData(4, 'Flor'),
  EMPLOYEE2: buildRepData(0, 'EMPLOYEE2'),
};

// Rep Build addons (applied to TEAM for projected months 12+)
export const REP_BUILD = {
  plan: {
    clients_signed: Array.from({length:N}, (_,i) => i >= 12 ? 1 : 0),
    dollars_signed: Array.from({length:N}, (_,i) => i >= 12 ? 150000 : 0),
    clients_receiving_terms: Array.from({length:N}, (_,i) => i >= 12 ? 1 : 0),
    terms_signed: Array.from({length:N}, (_,i) => i >= 12 ? 1 : 0),
    volume_terms_signed: Array.from({length:N}, (_,i) => i >= 12 ? 100000 : 0),
    deals_closed: Array.from({length:N}, (_,i) => i >= 12 ? 0 : 0),
    dollars_funded: Array.from({length:N}, (_,i) => i >= 12 ? 0 : 0),
  },
  revenue: {
    retainer: Array.from({length:N}, (_,i) => i >= 12 ? 5000 : 0),
    consulting_milestone: Array.from({length:N}, (_,i) => i >= 12 ? 3000 : 0),
    fee: Array.from({length:N}, (_,i) => i >= 12 ? 2000 : 0),
  },
};

// Active reps included in TEAM (excludes EMPLOYEE2)
export const DEFAULT_ACTIVE_REPS = ['Teresa', 'Niki', 'Paz', 'Flor'];

// Compute TEAM data from active reps + rep build
export function computeTeamData(activeReps: string[], repsData: Record<string, RepData>): TeamData {
  const reps = activeReps.map(n => repsData[n]).filter(Boolean);
  
  const sumRepArrays = (getter: (r: RepData) => number[]) =>
    reps.length > 0 ? sumArrays(...reps.map(getter)) : zeros(N);
  
  // Plan: sum reps + rep build addon for projected rows
  const planClientsSigned = sumArrays(sumRepArrays(r => r.plan.clients_signed), REP_BUILD.plan.clients_signed);
  const planDollarsSigned = sumArrays(sumRepArrays(r => r.plan.dollars_signed), REP_BUILD.plan.dollars_signed);
  const planClientsRecTerms = sumArrays(sumRepArrays(r => r.plan.clients_receiving_terms), REP_BUILD.plan.clients_receiving_terms);
  const planTermsSigned = sumArrays(sumRepArrays(r => r.plan.terms_signed), REP_BUILD.plan.terms_signed);
  const planVolTerms = sumArrays(sumRepArrays(r => r.plan.volume_terms_signed), REP_BUILD.plan.volume_terms_signed);
  const planDealsClosed = sumArrays(sumRepArrays(r => r.plan.deals_closed), REP_BUILD.plan.deals_closed);
  const planDollarsFunded = sumArrays(sumRepArrays(r => r.plan.dollars_funded), REP_BUILD.plan.dollars_funded);
  
  // Plan rows 10-13: actuals months = sum(reps), projected = derived via offset
  const proposalsIssued = Array.from({length:N}, (_,i) => {
    if (i < 12) return sumRepArrays(r => r.plan.proposals_issued)[i];
    const next = i + 1 < N ? planClientsSigned[i+1] : 0;
    return Math.round(next / 0.60);
  });
  const dollarsProposed = Array.from({length:N}, (_,i) => {
    if (i < 12) return sumRepArrays(r => r.plan.dollars_proposed)[i];
    const next = i + 1 < N ? planDollarsSigned[i+1] : 0;
    return Math.round(next / 0.60);
  });
  const dealsOnBoard = Array.from({length:N}, (_,i) => {
    if (i < 12) return sumRepArrays(r => r.plan.deals_on_board)[i];
    const next = i + 1 < N ? proposalsIssued[i+1] : 0;
    return Math.round(next / 0.66);
  });
  const dollarsOnBoard = Array.from({length:N}, (_,i) => {
    if (i < 12) return sumRepArrays(r => r.plan.dollars_on_board)[i];
    const next = i + 1 < N ? dollarsProposed[i+1] : 0;
    return Math.round(next / 0.66);
  });

  // Revenue: sum reps + rep build addon
  const retainer = sumArrays(sumRepArrays(r => r.revenue.retainer_revenue), REP_BUILD.revenue.retainer);
  const consulting = sumArrays(sumRepArrays(r => r.revenue.consulting__milestone_revenue), REP_BUILD.revenue.consulting_milestone);
  const fee = sumArrays(sumRepArrays(r => r.revenue.fee_revenue), REP_BUILD.revenue.fee);
  const totalRev = Array.from({length:N}, (_,i) => {
    if (i < 12) return sumRepArrays(r => r.revenue.total_revenue)[i];
    return retainer[i] + consulting[i] + fee[i];
  });
  
  // Rep Cost: months 0-23 = sum(reps), months 24-35 = use stored values
  const repCostKeys: (keyof RepData['rep_cost'])[] = ['salary','burden_rate','401k','tande','commissions','bonus_pool','total_rep_cost'];
  const costArrays = repCostKeys.map(key => {
    const summed = sumRepArrays(r => r.rep_cost[key]);
    return Array.from({length:N}, (_,i) => i < 24 ? summed[i] : summed[i]);
  });
  
  const totalCost = costArrays[6];
  const netRepProfit = subtractArrays(totalRev, totalCost);
  const ttmRev = computeTTM(totalRev);
  const ytdRev = computeYTD(totalRev);
  const ttmCost = computeTTM(totalCost);
  const allTimeRev = computeAllTime(totalRev);
  const allTimeCost = computeAllTime(totalCost);
  const allTimeProfit = computeAllTime(netRepProfit);
  const ttmProfit = computeTTM(netRepProfit);
  
  // Actuals forecast: actuals months = original, projected = computed plan
  const af = {
    deals_on_board: dealsOnBoard.slice(),
    dollars_on_board: dollarsOnBoard.slice(),
    proposals_issued: proposalsIssued.slice(),
    dollars_proposed: dollarsProposed.slice(),
    clients_signed: planClientsSigned.slice(),
    dollars_signed: planDollarsSigned.slice(),
    clients_receiving_terms: planClientsRecTerms.slice(),
    terms_signed: planTermsSigned.slice(),
    volume_terms_signed: planVolTerms.slice(),
    deals_closed: planDealsClosed.slice(),
    dollars_funded: planDollarsFunded.slice(),
    retainer: retainer.slice(),
    consulting_milestone: consulting.slice(),
    fee: fee.slice(),
    total_revenue: totalRev.slice(),
  };
  
  const planArr = [dealsOnBoard, dollarsOnBoard, proposalsIssued, dollarsProposed,
    planClientsSigned, planDollarsSigned, planClientsRecTerms, planTermsSigned,
    planVolTerms, planDealsClosed, planDollarsFunded];
  
  const varianceDollarObj: any = {};
  const variancePctObj: any = {};
  const perfToPlanObj: any = {};
  const keys = ['deals_on_board','dollars_on_board','proposals_issued','dollars_proposed',
    'clients_signed','dollars_signed','clients_receiving_terms','terms_signed',
    'volume_terms_signed','deals_closed','dollars_funded','retainer','consulting_milestone','fee','total_revenue'];
  
  keys.forEach((key, idx) => {
    const afArr = (af as any)[key];
    const planRow = idx < 11 ? planArr[idx] : idx === 11 ? retainer : idx === 12 ? consulting : idx === 13 ? fee : totalRev;
    varianceDollarObj[key] = subtractArrays(afArr, planRow);
    variancePctObj[key] = divideArrays(varianceDollarObj[key], planRow);
    perfToPlanObj[key] = divideArrays(afArr, planRow);
  });
  
  const roiProfit = netRepProfit.slice();
  const ytdProfit = computeYTD(roiProfit);
  
  return {
    plan: {
      deals_on_board: dealsOnBoard, dollars_on_board: dollarsOnBoard,
      proposals_issued: proposalsIssued, dollars_proposed: dollarsProposed,
      clients_signed: planClientsSigned, dollars_signed: planDollarsSigned,
      clients_receiving_terms: planClientsRecTerms, terms_signed: planTermsSigned,
      volume_terms_signed: planVolTerms, deals_closed: planDealsClosed, dollars_funded: planDollarsFunded,
    },
    pipeline_snapshot: {
      deals_in_dev: dealsOnBoard.map(v => Math.round(v*0.6)),
      dollars_in_dev: dollarsOnBoard.map(v => Math.round(v*0.6)),
      active_deals: dealsOnBoard.map(v => Math.round(v*0.8)),
      active_deal_volume: dollarsOnBoard.map(v => Math.round(v*0.8)),
      deals_in_diligence: planDealsClosed.map(v => Math.round(v*1.5)),
      dollars_in_diligence: planDollarsFunded.map(v => Math.round(v*1.5)),
    },
    revenue: { retainer, consulting_milestone: consulting, fee, total: totalRev },
    ttm_revenue: ttmRev,
    ytd_revenue: ytdRev,
    msql: planClientsSigned.map(v => Math.round(v*3)),
    revenue_signed_up: planDollarsSigned.map(v => Math.round(v*0.8)),
    rep_cost: {
      salary: costArrays[0], burden_rate: costArrays[1], four01k: costArrays[2],
      t_and_e: costArrays[3], commissions: costArrays[4], bonus_pool: costArrays[5], total: costArrays[6],
    },
    next_12_bonus: Array.from({length:N}, (_,i) => {
      let s = 0; for (let j = i; j < Math.min(i+12, N); j++) s += costArrays[5][j]; return s;
    }),
    net_rep_profit: netRepProfit,
    all_time_rep_revenue: allTimeRev,
    all_time_rep_cost: allTimeCost,
    all_time_rep_profit: allTimeProfit,
    all_time_rep_roi_pct: allTimeProfit.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    all_time_rep_roi_multiple: allTimeRev.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    ttm_revenue_row63: ttmRev,
    ttm_cost: ttmCost,
    ttm_rep_profit: ttmProfit,
    ttm_rep_roi_pct: ttmProfit.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
    ttm_rep_roi_multiple: ttmRev.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
    actuals_input: {
      deals_on_board: dealsOnBoard.map((v,i) => i < 13 ? v : 0),
      dollars_on_board: dollarsOnBoard.map((v,i) => i < 13 ? v : 0),
      proposals_issued: proposalsIssued.map((v,i) => i < 13 ? v : 0),
      dollars_proposed: dollarsProposed.map((v,i) => i < 13 ? v : 0),
      clients_signed: planClientsSigned.map((v,i) => i < 13 ? v : 0),
      dollars_signed: planDollarsSigned.map((v,i) => i < 13 ? v : 0),
      clients_receiving_terms: planClientsRecTerms.map((v,i) => i < 13 ? v : 0),
      terms_signed: planTermsSigned.map((v,i) => i < 13 ? v : 0),
      volume_terms_signed: planVolTerms.map((v,i) => i < 13 ? v : 0),
      deals_closed: planDealsClosed.map((v,i) => i < 13 ? v : 0),
      dollars_funded: planDollarsFunded.map((v,i) => i < 13 ? v : 0),
      retainer: retainer.map((v,i) => i < 13 ? v : 0),
      consulting_milestone: consulting.map((v,i) => i < 13 ? v : 0),
      fee: fee.map((v,i) => i < 13 ? v : 0),
      total_revenue: totalRev.map((v,i) => i < 13 ? v : 0),
    },
    actuals_forecast_section: af,
    total_sales_pipeline_count: sumArrays(af.deals_on_board, af.proposals_issued, af.clients_signed),
    total_sales_pipeline_dollars: sumArrays(af.dollars_on_board, af.dollars_proposed, af.dollars_signed),
    msql_row115: planClientsSigned.map(v => Math.round(v*3)),
    revenue_signed_up_row117: planDollarsSigned.map(v => Math.round(v*0.8)),
    ytd_actual_revenue: computeYTD(af.total_revenue),
    all_time_actual_revenue: computeAllTime(af.total_revenue),
    ttm_revenue_row121: computeTTM(af.total_revenue),
    actuals_pipeline: {
      deals_in_dev: af.deals_on_board.map(v => Math.round(v*0.6)),
      dollars_in_dev: af.dollars_on_board.map(v => Math.round(v*0.6)),
      active_deals: af.deals_on_board.map(v => Math.round(v*0.8)),
      active_deal_volume: af.dollars_on_board.map(v => Math.round(v*0.8)),
      deals_in_diligence: af.deals_closed.map(v => Math.round(v*1.5)),
      dollars_in_diligence: af.dollars_funded.map(v => Math.round(v*1.5)),
    },
    variance_dollar: varianceDollarObj,
    variance_pct: variancePctObj,
    total_costs: totalCost,
    sales_team_roi: {
      profit: roiProfit,
      ytd_profit: ytdProfit,
      ttm_profit: ttmProfit,
      all_time_profit: allTimeProfit,
      ttm_roi: ttmProfit.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
      all_time_roi: allTimeProfit.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
      ttm_multiple: ttmRev.map((v,i) => ttmCost[i] ? v/ttmCost[i] : 0),
      all_time_multiple: allTimeRev.map((v,i) => allTimeCost[i] ? v/allTimeCost[i] : 0),
    },
    perf_to_plan: perfToPlanObj,
    sidebar: { ...DEFAULT_ASSUMPTIONS },
  };
}

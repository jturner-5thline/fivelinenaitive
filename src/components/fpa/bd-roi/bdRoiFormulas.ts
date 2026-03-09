// BD Budget — Formula engine

export function rollingSum(arr: number[], idx: number, window = 4): number | null {
  if (idx < window - 1) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function ytdSum(arr: number[], idx: number): number {
  const start = idx - (idx % 4);
  let sum = 0;
  for (let i = start; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function allTimeSum(arr: number[], idx: number): number {
  let sum = 0;
  for (let i = 0; i <= idx; i++) sum += arr[i] ?? 0;
  return sum;
}

export function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}

export function forwardSum(arr: number[], idx: number, window = 4): number {
  let sum = 0;
  for (let i = idx; i < idx + window; i++) {
    sum += (i < arr.length ? arr[i] : 0) ?? 0;
  }
  return sum;
}

export function mapArr(length: number, fn: (i: number) => number | null): (number | null)[] {
  return Array.from({ length }, (_, i) => fn(i));
}

export function mapArrNum(length: number, fn: (i: number) => number): number[] {
  return Array.from({ length }, (_, i) => fn(i));
}

export interface DashboardComputed {
  totalRevenue: number[];
  ttmRevenue: (number | null)[];
  otherCosts: number[];
  salesBDCosts: number[];
  margin: number[];
  ytdMargin: number[];
  ttmMargin: (number | null)[];
  allTimeMargin: number[];
  marginPct: (number | null)[];
  headcount: number[];
  totalCosts: number[];
  operatingProfit: number[];
  ytdOpProfit: number[];
  ttmOpProfit: (number | null)[];
  allTimeOpProfit: number[];
  ttmROI: (number | null)[];
  totalCostsWBonus: number[];
  netProfit: number[];
  ytdProfit: number[];
  ttmProfit: (number | null)[];
  allTimeProfit: number[];
  ttmROIWBonus: (number | null)[];
  salesBDPctRev: (number | null)[];
  // Key Stats
  ttmROIPct: (number | null)[];
  runRateROI: (number | null)[];
  ttmCostPerDOB: (number | null)[];
  ttmCAC: (number | null)[];
}

export function computeDashboard(
  revenue: { debt: number[]; finServ: number[]; other: number[] },
  costs: { events: number[]; te: number[]; flights: number[]; food: number[]; otherTE: number[]; software: number[]; other2: number[]; other3: number[]; allOther: number[] },
  hc: { debt: number[]; finServ: number[]; chandlerTyler: number[] },
  cmBonus: number[],
  dealflow: { dobTotal: number[]; dsTotal: number[] },
): DashboardComputed {
  const Q = 12;

  const totalRevenue = mapArrNum(Q, i => revenue.debt[i] + revenue.finServ[i] + revenue.other[i]);
  const ttmRevenue = mapArr(Q, i => rollingSum(totalRevenue, i));
  const otherCosts = mapArrNum(Q, i => costs.software[i] + costs.other2[i] + costs.other3[i] + costs.allOther[i]);

  const salesBDCosts = mapArrNum(Q, i => {
    const eventsVal = (i >= 3 && i <= 7 && i + 1 < Q) ? costs.events[i + 1] : costs.events[i];
    return eventsVal + costs.te[i] + otherCosts[i];
  });

  const margin = mapArrNum(Q, i => totalRevenue[i] - salesBDCosts[i]);
  const ytdMargin = mapArrNum(Q, i => ytdSum(margin, i));
  const ttmMargin = mapArr(Q, i => rollingSum(margin, i));
  const allTimeMargin = mapArrNum(Q, i => allTimeSum(margin, i));
  const marginPct = mapArr(Q, i => safeDiv(margin[i], totalRevenue[i]));

  const headcount = mapArrNum(Q, i => hc.debt[i] + hc.finServ[i] + hc.chandlerTyler[i]);
  const totalCosts = mapArrNum(Q, i => salesBDCosts[i] + headcount[i]);

  const operatingProfit = mapArrNum(Q, i => totalRevenue[i] - totalCosts[i]);
  const ytdOpProfit = mapArrNum(Q, i => ytdSum(operatingProfit, i));
  const ttmOpProfit = mapArr(Q, i => rollingSum(operatingProfit, i));
  const allTimeOpProfit = mapArrNum(Q, i => allTimeSum(operatingProfit, i));
  const ttmROI = mapArr(Q, i => safeDiv(rollingSum(totalRevenue, i), rollingSum(totalCosts, i)));

  const totalCostsWBonus = mapArrNum(Q, i => totalCosts[i] + cmBonus[i]);
  const netProfit = mapArrNum(Q, i => operatingProfit[i] - cmBonus[i]);
  const ytdProfit = mapArrNum(Q, i => ytdSum(netProfit, i));
  const ttmProfit = mapArr(Q, i => rollingSum(netProfit, i));
  const allTimeProfit = mapArrNum(Q, i => allTimeSum(netProfit, i));
  const ttmROIWBonus = mapArr(Q, i => safeDiv(rollingSum(totalRevenue, i), rollingSum(totalCostsWBonus, i)));
  const salesBDPctRev = mapArr(Q, i => safeDiv(salesBDCosts[i], totalRevenue[i]));

  // Key Stats
  const ttmROIPct = mapArr(Q, i => safeDiv(rollingSum(netProfit, i), rollingSum(totalCostsWBonus, i)));
  const runRateROI = mapArr(Q, i => {
    const fwdNP = forwardSum(netProfit, i);
    const fwdCost = forwardSum(totalCostsWBonus, i);
    return safeDiv(fwdNP, fwdCost);
  });
  const ttmCostPerDOB = mapArr(Q, i => safeDiv(rollingSum(totalCostsWBonus, i), rollingSum(dealflow.dobTotal, i)));
  const ttmCAC = mapArr(Q, i => safeDiv(rollingSum(totalCostsWBonus, i), rollingSum(dealflow.dsTotal, i)));

  return {
    totalRevenue, ttmRevenue, otherCosts, salesBDCosts, margin, ytdMargin, ttmMargin, allTimeMargin, marginPct,
    headcount, totalCosts, operatingProfit, ytdOpProfit, ttmOpProfit, allTimeOpProfit, ttmROI,
    totalCostsWBonus, netProfit, ytdProfit, ttmProfit, allTimeProfit, ttmROIWBonus, salesBDPctRev,
    ttmROIPct, runRateROI, ttmCostPerDOB, ttmCAC,
  };
}

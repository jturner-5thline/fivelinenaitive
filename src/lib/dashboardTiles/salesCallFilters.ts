/**
 * Sales-call title rules shared by the Sales Dashboard tiles and MCP tools.
 * Debt: titles containing "5th Line … Financing Review".
 * FinServ: "5th Line <> [Company] Financial Review" or "[Company] <> 5th Line: Intro",
 * and never a Debt financing review. Import-safe.
 */
const DEBT_FINANCING_RE = /5\s*th\s*line[\s\S]{0,80}\bfinancing\s+review\b/i;
const FINSERV_FINANCIAL_RE = /^\s*5\s*th\s+line\s*(?:<>|[-–—|:/])\s*.+?\s+financial\s+review\s*$/i;
const FINSERV_INTRO_RE = /^\s*.+?\s*(?:<>|[-–—|/])\s*5\s*th\s+line\s*[:\-–—]?\s*intro\s*$/i;

export function isSalesCallTitleForVariant(title: string | null | undefined, variant: "debt" | "finserv"): boolean {
  const t = title || "";
  if (variant === "finserv") return (FINSERV_FINANCIAL_RE.test(t) || FINSERV_INTRO_RE.test(t)) && !DEBT_FINANCING_RE.test(t);
  return DEBT_FINANCING_RE.test(t);
}

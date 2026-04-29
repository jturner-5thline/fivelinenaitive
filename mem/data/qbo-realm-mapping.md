---
name: qbo-realm-mapping
description: QuickBooks Online realm IDs for all 5th Line entities, used by Executive Dashboard Revenue cards and the QBO entity config
type: reference
---
QBO realm IDs (source: `quickbooks_tokens` table, confirmed 2026-04-29):

- 5th Line Capital Advisors LLC ("Debt") — `193514877331929`
- 5th Line Capital, LLC — `123146077561874`
- 5th Line Financial Services, LLC ("FinServ") — `9341451968897660`
- 5th Line Technologies LLC ("Tech") — `9130350272677286`

IMPORTANT: Do NOT swap these. The KPI card on /insights previously had
Debt/FinServ entityIds reversed in `ManagementSnapshotDashboard.tsx`,
which caused FinServ to show $0 and Debt to show FinServ's revenue.

Canonical mapping lives in `src/config/qboEntities.ts` as a leaf module
(no React imports) so it's safe to consume from any chunk without TDZ risk.
The Executive Dashboard "Revenue (QTD)" card uses Capital Advisors only.

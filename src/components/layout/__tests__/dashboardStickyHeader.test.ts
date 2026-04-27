import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Architectural guardrail: every dashboard route must mount its sticky
 * header through one of the two shared abstractions:
 *   - <DashboardPage>           (preferred — owns container + padding)
 *   - <StickyDashboardHeader>   (lower-level primitive, used by Insights)
 *
 * This prevents drift back to ad-hoc `sticky top-0` divs that would not
 * share the same scrollable ancestor (`<main>` in AppLayout) and would
 * silently break sticky positioning on some routes.
 */

const repoRoot = resolve(__dirname, '../../../..');
const pagesDir = join(repoRoot, 'src/pages');

const DASHBOARD_PAGES = [
  'Insights.tsx',
  'SalesBD.tsx',
  'Finance.tsx',
  'FinServ.tsx',
  'NaitivePipeline.tsx',
];

const read = (p: string) => readFileSync(p, 'utf-8');

describe('Dashboard sticky-header architecture', () => {
  it.each(DASHBOARD_PAGES)(
    '%s mounts its sticky header through DashboardPage or StickyDashboardHeader',
    (file) => {
      const src = read(join(pagesDir, file));
      const usesShared =
        /from\s+["']@\/components\/layout\/DashboardPage["']/.test(src) ||
        /from\s+["']@\/components\/layout\/StickyDashboardHeader["']/.test(src);
      expect(usesShared, `${file} must import DashboardPage or StickyDashboardHeader`).toBe(true);
    },
  );

  it.each(DASHBOARD_PAGES)(
    '%s does not roll its own ad-hoc `sticky top-0` page header',
    (file) => {
      const src = read(join(pagesDir, file));
      // Strip JSX comments so they don't trip the heuristic.
      const stripped = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      // Look for `sticky` immediately followed by a `top-0` utility on the
      // SAME className — but only on plain <div> elements (the shared
      // component is allowed to use it internally).
      const adHoc = stripped.match(
        /<div[^>]*className=(["'`])[^"'`]*\bsticky\b[^"'`]*\btop-0\b[^"'`]*\1/,
      );
      expect(adHoc, `${file} should delegate sticky positioning to the shared header`).toBeNull();
    },
  );
});
---
name: Asana Goals & Portfolios widget removed
description: Removed asana-goals widget from Management Review dashboard; restore exactly if user asks to bring it back
type: feature
---
User removed the "Asana Goals & Portfolios" widget from the Management Review Dashboard (`src/components/metrics/dashboards/ManagementReviewDashboard.tsx`).

**To restore exactly as it was:**
1. Re-add import at top of file:
   `import { AsanaGoalsPortfoliosSection } from './AsanaGoalsPortfoliosSection';`
2. Add back to `INSIGHTS_DEFAULT_LAYOUT` array (after `debt-rating`):
   `{ i: 'asana-goals', x: 0, y: 19, w: 12, h: 6, minW: 6, minH: 4 },`
3. Add back the JSX block inside `<DraggableGridLayout>` (after the `debt-rating` block):
   ```tsx
   <div key="asana-goals" className="h-full overflow-auto">
     <GridShell isEditMode={isEditMode} title="Asana Goals & Portfolios">
       <AsanaGoalsPortfoliosSection />
     </GridShell>
   </div>
   ```
4. Bump the `useGridLayout` storage key version (currently `insights-management-review-v17`) so existing users auto-pick up the restored default.
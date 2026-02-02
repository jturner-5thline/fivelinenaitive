

## Fix Clock Icon Centering in Latest Updates Widget

### Problem
The clock icon isn't perfectly centered in the circular widget button because:
- The `gap-2` class creates spacing between all flex children
- The hidden span (`max-w-0`) still participates in the flex layout
- The layout algorithm offsets the icon even when other elements are visually hidden

### Solution
Restructure the button content so that:
1. The icon is wrapped in a container that is always centered
2. The expanding text label is positioned in a way that doesn't affect the icon's centering when collapsed
3. Remove `gap-2` from the button and handle spacing differently

### Implementation

**File: `src/pages/DealDetail.tsx`**

Change from:
```tsx
<Button
  variant="gradient"
  size="sm"
  className="rounded-full h-12 w-12 group-hover:w-auto group-hover:px-4 px-0 shadow-lg gap-2 animate-fade-in transition-all duration-300 overflow-hidden flex items-center justify-center"
>
  <Clock className="h-4 w-4 shrink-0" />
  <span className="max-w-0 group-hover:max-w-32 overflow-hidden whitespace-nowrap transition-all duration-300">
    Latest Updates
  </span>
  ...
</Button>
```

To:
```tsx
<Button
  variant="gradient"
  size="sm"
  className="rounded-full h-12 min-w-12 group-hover:pl-4 group-hover:pr-4 shadow-lg animate-fade-in transition-all duration-300 overflow-hidden flex items-center justify-center relative"
>
  <div className="flex items-center justify-center">
    <Clock className="h-4 w-4 shrink-0" />
    <span className="max-w-0 group-hover:max-w-32 group-hover:ml-2 overflow-hidden whitespace-nowrap transition-all duration-300">
      Latest Updates
    </span>
  </div>
  ...badge (positioned absolutely)...
</Button>
```

Key changes:
- Remove `gap-2` so spacing doesn't affect collapsed state
- Use `group-hover:ml-2` on the span to add spacing only when expanded
- Keep icon and text in a flex container for proper alignment
- Use `min-w-12` instead of `w-12` for collapsed width to prevent shrinking issues
- Remove fixed `w-12` and let the button size naturally when expanded


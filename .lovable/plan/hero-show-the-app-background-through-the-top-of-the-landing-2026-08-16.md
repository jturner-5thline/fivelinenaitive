# Hero: show the app background through the top of the landing page

## Goal
The hero section at the top of the landing page currently paints its own image-based background, so the new corner-anchored blue gradient never shows there. Make the hero fully transparent so the app backdrop reads all the way from the top of the page.

## Changes
- In the hero component, remove the layer that paints the hero background image (`hero-bg-v2.png`) and drop its now-unused import.
- Remove the two decorative blend-mode glow overlays (hue tint and overlay wash) that only existed to recolor that image, so nothing sits between the content and the app backdrop.
- Keep the hero section itself `bg-transparent` with its existing layout, sizing, headline, and email capture form untouched.
- Verify the hero-to-page fade gradient on the homepage still blends cleanly against the new backdrop; if it darkens the top area, retune its stops to transparent.

## Technical notes
- Files: `src/components/homepage/HomepageHero.tsx` (remove image + overlay divs, remove `heroBg` import), and if needed `src/pages/Homepage.tsx` (fade gradient stops).
- The page-level `var(--app-backdrop)` with `background-attachment: fixed` already covers the viewport, so no new background is needed on the hero.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the dashboard quick-action tile restyle.
 *
 * The previous gradient-chip implementation referenced `TILE_CHIP_BASE`,
 * `TILE_CHIP_GRADIENTS`, and `<TileChipGloss>`. After the unified-card
 * restyle, none of those identifiers should remain — leftovers caused
 * runtime ReferenceErrors on /dashboard. This test pins that contract.
 */
describe('Dashboard.tsx tile tokens', () => {
  const source = readFileSync(
    resolve(__dirname, '../Dashboard.tsx'),
    'utf8',
  );

  it('does not reference removed gradient-chip identifiers', () => {
    expect(source).not.toMatch(/\bTILE_CHIP_BASE\b/);
    expect(source).not.toMatch(/\bTILE_CHIP_GRADIENTS\b/);
    expect(source).not.toMatch(/\bTileChipGloss\b/);
  });

  it('uses the unified QuickActionTile component', () => {
    expect(source).toMatch(/function QuickActionTile\b/);
    expect(source).toMatch(/<QuickActionTile\b/);
  });

  it('uses semantic surface tokens for the tile (no inline hex)', () => {
    // The shared tile classes should reference bg-card / border-border,
    // not raw hex colors or one-off gradient stops.
    expect(source).toMatch(/bg-card/);
    expect(source).toMatch(/border-border/);
  });
});
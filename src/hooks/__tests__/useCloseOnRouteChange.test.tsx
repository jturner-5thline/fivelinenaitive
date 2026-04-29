/**
 * @vitest-environment jsdom
 *
 * Regression tests for the dashboard quick-action safety net.
 *
 * The bug being prevented: a dashboard dropdown / widget panel that fires a
 * navigation (directly or via a child link) lingers visible on top of the
 * destination route until React re-renders. `useCloseOnRouteChange`
 * subscribes to `useLocation()` and synchronously calls `close()` on every
 * pathname change while the panel is open.
 *
 * These tests intentionally avoid React Testing Library (not installed in
 * this project) — instead we drive React directly with `react-dom/test-utils`
 * and a `MemoryRouter`, which is enough to assert the hook contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useCloseOnRouteChange } from '../useCloseOnRouteChange';

// React 18 act() wants this flag set so it doesn't print a warning per call.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function PanelHarness({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) {
  useCloseOnRouteChange(isOpen, close);
  const navigate = useNavigate();
  return (
    <button data-testid="navigate" onClick={() => navigate('/destination')}>
      go
    </button>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useCloseOnRouteChange (router-level safety net)', () => {
  it('closes the panel synchronously when the pathname changes while open', () => {
    const close = vi.fn();

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<PanelHarness isOpen close={close} />} />
            <Route path="/destination" element={<PanelHarness isOpen close={close} />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(close).not.toHaveBeenCalled();

    const btn = container.querySelector<HTMLButtonElement>('[data-testid="navigate"]')!;
    act(() => {
      btn.click();
    });

    // Safety net must fire exactly once on the route change.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on initial mount (no pathname change yet)', () => {
    const close = vi.fn();

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <PanelHarness isOpen close={close} />
        </MemoryRouter>,
      );
    });

    expect(close).not.toHaveBeenCalled();
  });

  it('does NOT call close when the panel is already closed (isOpen=false)', () => {
    const close = vi.fn();

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<PanelHarness isOpen={false} close={close} />} />
            <Route path="/destination" element={<PanelHarness isOpen={false} close={close} />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const btn = container.querySelector<HTMLButtonElement>('[data-testid="navigate"]')!;
    act(() => {
      btn.click();
    });

    expect(close).not.toHaveBeenCalled();
  });

  it('fires close once per pathname change (not per render)', () => {
    const close = vi.fn();

    function MultiNav() {
      useCloseOnRouteChange(true, close);
      const navigate = useNavigate();
      return (
        <>
          <button data-testid="go-a" onClick={() => navigate('/a')}>a</button>
          <button data-testid="go-b" onClick={() => navigate('/b')}>b</button>
        </>
      );
    }

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="*" element={<MultiNav />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="go-a"]')!.click();
    });
    expect(close).toHaveBeenCalledTimes(1);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="go-b"]')!.click();
    });
    expect(close).toHaveBeenCalledTimes(2);
  });
});
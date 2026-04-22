import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// ── Pipeline Memo typography ───────────────────────────────
// DM Sans (body) + DM Serif Display (deal names) — used by the
// Pipeline & Clients "Memo" view inside the Daily Briefing modal.
import "@fontsource/dm-sans/300.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-serif-display/400.css";

const rootEl = document.getElementById("root");

if (rootEl) {
  try {
    createRoot(rootEl).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    // If React fails to mount, show error directly in DOM
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0f;color:#e2e8f0;font-family:system-ui;padding:2rem;text-align:center;">
        <div>
          <h1 style="font-size:1.5rem;margin-bottom:1rem;">Failed to start application</h1>
          <p style="color:#94a3b8;font-size:0.875rem;">${err instanceof Error ? err.message : 'Unknown error'}</p>
          <button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#3b82f6;color:white;border:none;border-radius:0.375rem;cursor:pointer;">Reload</button>
        </div>
      </div>
    `;
    console.error("Fatal app initialization error:", err);
  }
} else {
  document.body.innerHTML = '<p style="color:red;padding:2rem;">Root element not found</p>';
}

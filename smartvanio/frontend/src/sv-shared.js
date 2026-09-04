import { css } from "lit";

// Palette + spacing tokens. Mirrors smartvan.io-cards/main-card so the
// addon UI feels like the dashboard. Kept in one file rather than per
// component so a future theme switch is a single edit.
export const tokens = css`
  :host {
    --sv-bg: #0e1014;
    --sv-fg: #e5e7eb;
    --sv-muted: #9ca3af;
    --sv-card: #16181d;
    --sv-card-hover: #1c1f25;
    --sv-input: #0a0c10;
    --sv-border: rgba(255, 255, 255, 0.08);
    --sv-border-strong: rgba(255, 255, 255, 0.14);
    --sv-accent: #60a5fa;
    --sv-ok: #34d399;
    --sv-warn: #fbbf24;
    --sv-danger: #ef4444;
    --sv-radius: 12px;
    --sv-radius-lg: 16px;
  }
`;

export const baseFont = css`
  :host {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--sv-fg);
    line-height: 1.45;
  }
`;

// Shared widget styles. Imported into every page-level component so
// the markup can use plain class names without duplicating CSS.
export const widgets = css`
  .card {
    background: var(--sv-card);
    border: 1px solid var(--sv-border);
    border-radius: var(--sv-radius);
    padding: 18px 20px;
    margin-bottom: 16px;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }
  .card-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  h3 {
    font-size: 0.85rem;
    color: var(--sv-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 18px 0 8px;
    font-weight: 600;
  }
  .muted {
    color: var(--sv-muted);
    font-size: 0.85rem;
  }
  .badge {
    background: rgba(255, 255, 255, 0.08);
    color: var(--sv-fg);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.78rem;
    text-transform: lowercase;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }
  .dot-ok {
    background: var(--sv-ok);
  }
  .dot-warn {
    background: var(--sv-warn);
  }
  .inline-form {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  input[type="number"],
  input[type="text"],
  select {
    background: var(--sv-input);
    color: var(--sv-fg);
    border: 1px solid var(--sv-border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.95rem;
    font-family: inherit;
  }
  input[type="number"] {
    width: 110px;
  }
  button {
    background: var(--sv-accent);
    color: #0a0c10;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 0.95rem;
    cursor: pointer;
    font-family: inherit;
    font-weight: 600;
  }
  button:hover {
    filter: brightness(1.08);
  }
  button.secondary {
    background: transparent;
    color: var(--sv-fg);
    border: 1px solid var(--sv-border);
    font-weight: 500;
  }
  button.secondary:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  button.danger {
    background: var(--sv-danger);
    color: #fff;
  }
  button.danger:hover {
    background: #dc2626;
  }
  .button-row {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }
  label input[type="number"] {
    width: 130px;
  }
  .result {
    min-height: 1.4em;
    margin-top: 8px;
    font-size: 0.9rem;
  }
  .result.ok {
    color: var(--sv-ok);
  }
  .result.warn {
    color: var(--sv-warn);
  }
  .live-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .angle-card {
    background: var(--sv-input);
    border: 1px solid var(--sv-border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .angle-axis {
    color: var(--sv-muted);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .angle-value {
    font-size: 2.4rem;
    font-weight: 600;
    margin-top: 6px;
    line-height: 1;
  }
  .angle-unit {
    color: var(--sv-muted);
    font-size: 1.2rem;
    margin-left: 2px;
  }
`;

// Which calibration page a model routes to. Mirrors _model_kind() in
// ui/routes/api.py — keep the two in step, since the backend decides
// what `model_kind` the detail view actually receives.
export function deviceKind(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("inclinometer")) return "inclinometer";
  if (m.includes("resistive") || m.includes("tank")) return "resistive";
  if (m.includes("led")) return "led";
  return "unknown";
}

// Tile container styles. Mirrors the visual contract of the main
// card's `sharedTileStyles` at
// /Users/james/Projects/smartvan.io/smartvan.io-cards/main-card/src/smartvanio-shared.js
// (rounded frame, 1px border, hover state, tap-highlight off). Kept
// in sync by hand because the two codebases are separate npm projects
// — extract to a shared package once a third consumer appears.
export const tileFrame = css`
  .tile {
    background: var(--sv-card);
    border: 1px solid var(--sv-border);
    border-radius: var(--sv-radius);
    padding: 14px 16px;
    color: inherit;
    font: inherit;
    width: 100%;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: background 0.12s ease, border-color 0.12s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .tile:hover {
    background: var(--sv-card-hover);
    border-color: var(--sv-border-strong);
  }
  .tile:focus-visible {
    outline: 2px solid var(--sv-accent);
    outline-offset: 2px;
  }
`;

// HA's Ingress prefix, captured ONCE at module load.
//
// Reading location.pathname every call is wrong: after the SPA does a
// history.pushState to "<ingress>/device/<id>", a later read would
// return the post-push path and apiUrl()/wsUrl() would build doubled
// URLs like "<ingress>/device/<id>/api/device/<id>" → 404.
//
// The shell is served at either "<ingress>/" (list) or
// "<ingress>/device/<id>" (deep link), so strip a trailing
// "/device/<id>" segment if present, then strip a trailing slash.
const _INGRESS_BASE = (() => {
  const path = location.pathname.replace(/\/device\/[^/]+\/?$/, "");
  return path.replace(/\/+$/, "");
})();

export function ingressBase() {
  return _INGRESS_BASE;
}

export function apiUrl(path) {
  return `${ingressBase()}${path}`;
}

export function wsUrl(path) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${ingressBase()}${path}`;
}

// JSON POST helper. Returns the parsed JSON regardless of HTTP status
// so the caller can distinguish a 4xx with a useful `message` from a
// transport failure (which throws).
export async function postJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = { ok: false, message: `HTTP ${res.status}` };
  }
  if (typeof payload.ok !== "boolean") payload.ok = res.ok;
  return payload;
}

export async function getJson(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// Parse the device id from the current URL, or null if we're on the
// list view. Works under HA's Ingress prefix because we match against
// `pathname` directly.
export function deviceIdFromUrl() {
  const m = location.pathname.match(/\/device\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

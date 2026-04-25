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

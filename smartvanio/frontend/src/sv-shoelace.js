// Shoelace setup for the calibration UI.
//
// Registers the components we use (tree-shaken) and applies the dark theme once
// at the document level. Shoelace reads its --sl-* tokens from the inherited
// context, and CSS custom properties cross shadow boundaries, so a single
// document-level theme styles every nested <sl-*>. We keep the overrides light
// — the dark theme already styles inputs/selects well; we only nudge the
// primary ramp, shape and surfaces to the SmartVan.io palette. (An earlier pass
// over-rode the input background/border tokens, which fought the theme and made
// inputs look wrong.)
//
// Kept in one module so the future standalone app imports the exact same setup
// — no Home Assistant dependency.
import { css } from "lit";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/card/card.js";
import "@shoelace-style/shoelace/dist/components/tag/tag.js";
import darkTheme from "@shoelace-style/shoelace/dist/themes/dark.styles.js";

if (typeof document !== "undefined" && !document.getElementById("sv-sl-theme")) {
  const el = document.createElement("style");
  el.id = "sv-sl-theme";
  el.textContent =
    darkTheme.cssText +
    `
    .sl-theme-dark {
      /* Accent ramp -> SmartVan blue */
      --sl-color-primary-500: #60a5fa;
      --sl-color-primary-600: #60a5fa;
      --sl-color-primary-700: #3b82f6;
      /* Type + shape to match the rest of the UI */
      --sl-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        sans-serif;
      --sl-border-radius-medium: 8px;
      --sl-border-radius-large: 12px;
      /* Surfaces -> match sv card tokens (used by sl-card) */
      --sl-panel-background-color: #16181d;
      --sl-panel-border-color: rgba(255, 255, 255, 0.08);
    }
  `;
  document.head.appendChild(el);
  document.documentElement.classList.add("sl-theme-dark");
}

// Shared sl-card styling. Imported into each page's `static styles` (must live
// in the same shadow root as the <sl-card> to reach its ::part shadow parts).
// Gives every section the same surface as the old hand-rolled `.card`.
export const slCard = css`
  sl-card {
    display: block;
    width: 100%;
    margin-bottom: 16px;
  }
  sl-card::part(base) {
    background: var(--sv-card, #16181d);
    border-color: var(--sv-border, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }
  sl-card::part(header) {
    border-bottom-color: var(--sv-border, rgba(255, 255, 255, 0.08));
    padding: 14px 20px;
  }
  sl-card::part(body) {
    padding: 18px 20px;
  }
  sl-card [slot="header"] {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  sl-card [slot="header"] h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
`;

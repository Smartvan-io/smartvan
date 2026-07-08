// Shoelace setup for the calibration UI.
//
// Registers only the components we use (tree-shaken) and applies the dark
// theme once at the document level. Shoelace reads its --sl-* tokens from the
// inherited context, and CSS custom properties cross shadow boundaries, so a
// single document-level theme styles every nested <sl-*>. The overrides align
// Shoelace's primary ramp, surfaces and shape with the SmartVan.io palette
// (mirrors the sv-shared token *values*) so the library matches the rest of
// the UI.
//
// Kept in one module so the future standalone app imports the exact same
// setup — no Home Assistant dependency.
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import darkTheme from "@shoelace-style/shoelace/dist/themes/dark.styles.js";

if (typeof document !== "undefined" && !document.getElementById("sv-sl-theme")) {
  const el = document.createElement("style");
  el.id = "sv-sl-theme";
  el.textContent =
    darkTheme.cssText +
    `
    .sl-theme-dark {
      /* Primary ramp -> SmartVan accent */
      --sl-color-primary-500: #60a5fa;
      --sl-color-primary-600: #60a5fa;
      --sl-color-primary-700: #3b82f6;
      --sl-color-primary-950: #172554;
      /* Surfaces + inputs -> mirror sv-shared token values */
      --sl-panel-background-color: #16181d;
      --sl-input-background-color: #0a0c10;
      --sl-input-background-color-hover: #0a0c10;
      --sl-input-background-color-focus: #0a0c10;
      --sl-input-border-color: rgba(255, 255, 255, 0.08);
      --sl-input-border-color-hover: rgba(255, 255, 255, 0.14);
      --sl-input-color: #e5e7eb;
      --sl-input-placeholder-color: #9ca3af;
      /* Shape + type */
      --sl-border-radius-medium: 8px;
      --sl-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        sans-serif;
    }
  `;
  document.head.appendChild(el);
  document.documentElement.classList.add("sl-theme-dark");
}

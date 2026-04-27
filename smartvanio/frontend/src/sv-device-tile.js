// Stateless device tile.
//
// Visual contract intentionally mirrors the main card's
// `sharedTileStyles` (smartvan.io-cards/main-card/src/smartvanio-shared.js),
// but without any HA service-call wiring — the addon UI's job is just
// to display device identity and emit a click. If a third consumer
// ever needs the same tile, extract these bits into a shared package.

import { LitElement, html, css, svg } from "lit";
import { tokens, baseFont, tileFrame } from "./sv-shared.js";

// MDI icon paths (24x24 viewBox). Inlined to avoid pulling @mdi/js for
// four glyphs.
const ICONS = {
  inclinometer:
    // mdi:axis-arrow
    "M12,2L9,5H11V11H5V9L2,12L5,15V13H11V19H9L12,22L15,19H13V13H19V15L22,12L19,9V11H13V5H15L12,2Z",
  resistive:
    // mdi:water (also used for tank)
    "M12,3.77L11.25,4.61C11.25,4.61 9.97,6.06 8.68,7.94C7.39,9.82 6,12.07 6,14.23A6,6 0 0,0 12,20.23A6,6 0 0,0 18,14.23C18,12.07 16.61,9.82 15.32,7.94C14.03,6.06 12.75,4.61 12.75,4.61L12,3.77Z",
  led:
    // mdi:led-strip-variant
    "M3,3H21V7H3V3M3,9H21V13H3V9M3,15H21V19H3V15M5,5V6H7V5H5M9,5V6H11V5H9M5,11V12H7V11H5M9,11V12H11V11H9M5,17V18H7V17H5M9,17V18H11V17H9Z",
  unknown:
    // mdi:chip
    "M6,4H18V6H21V8H18V10H21V12H18V14H21V16H18V18H21V20H18V22H6V20H3V18H6V16H3V14H6V12H3V10H6V8H3V6H6V4M8,8V20H16V8H8Z",
};

function iconForModel(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("inclinometer")) return ICONS.inclinometer;
  if (m.includes("resistive") || m.includes("tank")) return ICONS.resistive;
  if (m.includes("led")) return ICONS.led;
  return ICONS.unknown;
}

export class SvDeviceTile extends LitElement {
  static properties = {
    device: { attribute: false },
  };

  constructor() {
    super();
    this.device = null;
  }

  render() {
    const d = this.device || {};
    const path = iconForModel(d.model);
    return html`
      <button class="tile" type="button" @click=${this._onClick}>
        <span class="icon" aria-hidden="true">
          ${svg`<svg viewBox="0 0 24 24" width="24" height="24"><path d=${path} fill="currentColor"/></svg>`}
        </span>
        <span class="body">
          <span class="name">${d.name || d.device_id || "Device"}</span>
          <span class="meta">
            ${d.model ? html`<span class="badge">${d.model}</span>` : null}
            ${d.sw_version ? html`<span class="muted">fw ${d.sw_version}</span>` : null}
          </span>
          <span class="id muted">${d.device_id || ""}</span>
        </span>
        <span class="chevron muted" aria-hidden="true">
          ${svg`<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z" fill="currentColor"/></svg>`}
        </span>
      </button>
    `;
  }

  _onClick = () => {
    if (!this.device) return;
    // sv-app already listens for sv-device-open; keep the event name
    // stable so existing wiring works.
    this.dispatchEvent(
      new CustomEvent("sv-device-open", {
        detail: { device: this.device },
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = [
    tokens,
    baseFont,
    tileFrame,
    css`
      :host {
        display: block;
      }
      .tile {
        flex-direction: row;
      }
      .icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(96, 165, 250, 0.12);
        color: var(--sv-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .name {
        font-weight: 600;
        font-size: 0.95rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 0.78rem;
      }
      .badge {
        background: rgba(255, 255, 255, 0.08);
        color: var(--sv-fg);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 0.72rem;
        text-transform: lowercase;
      }
      .id {
        font-size: 0.72rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .muted {
        color: var(--sv-muted);
      }
      .chevron {
        flex-shrink: 0;
      }
    `,
  ];
}

customElements.define("sv-device-tile", SvDeviceTile);

import { LitElement, html, css } from "lit";
import { tokens, baseFont } from "./sv-shared.js";
import "./sv-device-tile.js";

export class SvDeviceList extends LitElement {
  static properties = {
    devices: { attribute: false },
    haReady: { type: Boolean, attribute: "ha-ready" },
  };

  constructor() {
    super();
    this.devices = [];
    this.haReady = false;
  }

  render() {
    return html`
      <header class="header">
        <h1>Devices</h1>
      </header>
      <div class="grid">
        ${this.devices.length === 0
          ? html`<p class="empty">
              No devices discovered yet. Power on a SmartVan.io device and wait
              a few seconds — they appear here automatically.
            </p>`
          : this.devices.map(
              (d) => html`<sv-device-tile .device=${d}></sv-device-tile>`,
            )}
      </div>
    `;
  }

  static styles = [
    tokens,
    baseFont,
    css`
      :host {
        display: block;
      }
      .header {
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 14px;
      }
      .empty {
        grid-column: 1 / -1;
        color: var(--sv-muted);
        background: rgba(255, 255, 255, 0.02);
        border: 1px dashed var(--sv-border);
        border-radius: var(--sv-radius);
        padding: 18px;
        margin: 0;
      }
    `,
  ];
}

customElements.define("sv-device-list", SvDeviceList);

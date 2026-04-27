import { LitElement, html, css } from "lit";
import { tokens, baseFont } from "./sv-shared.js";

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
      ${this.devices.length === 0
        ? html`<p class="empty">
            No devices discovered yet. Power on a SmartVan.io device and wait a
            few seconds — they appear here automatically.
          </p>`
        : html`
            <ul class="list">
              ${this.devices.map(
                (d) => html`
                  <li>
                    <button class="device" @click=${() => this._open(d)}>
                      <span class="name">${d.name}</span>
                      <span class="meta">
                        <span class="badge">${d.model}</span>
                        ${d.sw_version
                          ? html`<span class="muted">fw ${d.sw_version}</span>`
                          : null}
                        <span class="muted">${d.device_id}</span>
                      </span>
                    </button>
                  </li>
                `,
              )}
            </ul>
          `}
    `;
  }

  _open(device) {
    this.dispatchEvent(
      new CustomEvent("sv-device-open", {
        detail: { device },
        bubbles: true,
        composed: true,
      }),
    );
  }

  static styles = [
    tokens,
    baseFont,
    css`
      :host {
        display: block;
        background: var(--sv-card);
        border: 1px solid var(--sv-border);
        border-radius: var(--sv-radius-lg);
        padding: 20px;
      }
      .header {
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
      }

      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      .device {
        width: 100%;
        text-align: left;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--sv-border);
        border-radius: var(--sv-radius);
        padding: 14px 16px;
        color: inherit;
        font: inherit;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        transition: background 0.12s, border-color 0.12s;
      }
      .device:hover {
        background: var(--sv-card-hover);
        border-color: var(--sv-border-strong);
      }
      .name {
        font-weight: 600;
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 10px;
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
      .muted {
        color: var(--sv-muted);
      }
      .empty {
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

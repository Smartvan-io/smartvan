import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, getJson, wsUrl } from "./sv-shared.js";
import "./sv-shoelace.js";
import "./sv-inclinometer-page.js";
import "./sv-resistive-page.js";
import "./sv-led-page.js";
import "./sv-device-unknown-page.js";

// Container for the detail view. Responsible for:
//   - Fetching the hydration payload from /api/device/<id>
//   - Owning the /ws/device/<id> socket and routing channel updates
//     to the active page component as a `live` map
//   - Rendering the right page component based on `model_kind`
export class SvDeviceDetail extends LitElement {
  static properties = {
    deviceId: { type: String },
    device: { attribute: false }, // optional — passed in from the list when known
    _payload: { state: true },
    _error: { state: true },
    _live: { state: true },
  };

  constructor() {
    super();
    this.deviceId = "";
    this.device = null;
    this._payload = null;
    this._error = null;
    this._live = {};
    this._ws = null;
    this._stopped = false;
    this._wsBackoff = 1000;
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetchPayload();
    this._openSocket();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopped = true;
    if (this._ws) {
      try {
        this._ws.close();
      } catch {}
    }
  }

  updated(changed) {
    if (changed.has("deviceId")) {
      this._payload = null;
      this._error = null;
      this._live = {};
      this._fetchPayload();
      if (this._ws) {
        try {
          this._ws.close();
        } catch {}
      }
      this._openSocket();
    }
  }

  async _fetchPayload() {
    if (!this.deviceId) return;
    const id = this.deviceId;
    try {
      const data = await getJson(`/api/device/${encodeURIComponent(id)}`);
      // Guard against late responses after a route change.
      if (this.deviceId !== id) return;
      this._payload = data;
    } catch (e) {
      if (this.deviceId !== id) return;
      this._error = e.message || "failed to load device";
    }
  }

  _openSocket() {
    if (this._stopped || !this.deviceId) return;
    const id = this.deviceId;
    const ws = new WebSocket(wsUrl(`/ws/device/${encodeURIComponent(id)}`));
    this._ws = ws;
    ws.addEventListener("open", () => {
      this._wsBackoff = 1000;
    });
    ws.addEventListener("message", (ev) => {
      // Ignore messages for stale sockets (would only happen mid-route-
      // change on a slow network).
      if (this.deviceId !== id) return;
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!payload?.channel) return;
      // Replace per-channel — Lit re-renders on this state assignment.
      this._live = { ...this._live, [payload.channel]: payload };
    });
    ws.addEventListener("close", () => {
      if (this._stopped || this.deviceId !== id) return;
      setTimeout(() => this._openSocket(), this._wsBackoff);
      this._wsBackoff = Math.min(this._wsBackoff * 2, 15000);
    });
    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {}
    });
  }

  _back = () => {
    this.dispatchEvent(
      new CustomEvent("sv-back-to-list", { bubbles: true, composed: true }),
    );
  };

  render() {
    const device = this._payload?.device || this.device;
    return html`
      <header class="header">
        <sl-button
          class="back"
          circle
          size="small"
          @click=${this._back}
          aria-label="Back"
          >←</sl-button
        >
        <div class="title-block">
          <div class="title">${device?.name || this.deviceId}</div>
          <div class="subtitle">
            ${device?.model
              ? html`<sl-tag size="small" pill>${device.model}</sl-tag>`
              : null}
            ${device?.sw_version
              ? html`<span class="muted">fw ${device.sw_version}</span>`
              : null}
            <span class="muted">${this.deviceId}</span>
          </div>
        </div>
      </header>

      ${this._renderBody()}
    `;
  }

  _renderBody() {
    if (this._error) {
      return html`<sl-alert variant="danger" open
        >Couldn't load this device: ${this._error}</sl-alert
      >`;
    }
    if (!this._payload) {
      return html`<p class="muted">Loading…</p>`;
    }
    const kind = this._payload.model_kind;
    if (kind === "inclinometer") {
      return html`
        <sv-inclinometer-page
          .deviceId=${this.deviceId}
          .data=${this._payload.inclinometer}
          .live=${this._live}
        ></sv-inclinometer-page>
      `;
    }
    if (kind === "resistive") {
      return html`
        <sv-resistive-page
          .deviceId=${this.deviceId}
          .data=${this._payload.resistive}
          .live=${this._live}
        ></sv-resistive-page>
      `;
    }
    if (kind === "led") {
      return html`
        <sv-led-page
          .deviceId=${this.deviceId}
          .data=${this._payload.led}
        ></sv-led-page>
      `;
    }
    return html`
      <sv-device-unknown-page
        .device=${this._payload.device}
      ></sv-device-unknown-page>
    `;
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    css`
      :host {
        display: block;
      }
      .header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 18px;
      }
      .back {
        background: transparent;
        border: 1px solid var(--sv-border);
        color: var(--sv-fg);
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 1.1rem;
        line-height: 1;
        flex-shrink: 0;
      }
      .back:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .title-block {
        flex: 1;
        min-width: 0;
      }
      .title {
        font-size: 1.15rem;
        font-weight: 600;
        line-height: 1.2;
      }
      .subtitle {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 6px;
      }
      .error {
        color: var(--sv-warn);
        background: rgba(251, 191, 36, 0.08);
        border: 1px solid rgba(251, 191, 36, 0.25);
        border-radius: var(--sv-radius);
        padding: 12px 16px;
      }
    `,
  ];
}

customElements.define("sv-device-detail", SvDeviceDetail);

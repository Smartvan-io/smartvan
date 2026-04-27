import { LitElement, html, css } from "lit";
import { tokens, baseFont } from "./sv-shared.js";
import "./sv-device-list.js";

// Root component. Owns:
//   - The persistent /ws/devices socket (server pushes JSON device lists).
//   - The currently-open device modal (Phase 2 — for now just logs).
//
// The ingress prefix is whatever path the page was loaded at (HA's
// hassio_ingress proxy strips the prefix server-side but the browser
// keeps it on URLs). Resolve API + WS URLs relative to location.
class SvApp extends LitElement {
  static properties = {
    _devices: { state: true },
    _haReady: { state: true },
  };

  constructor() {
    super();
    this._devices = [];
    this._haReady = false;
    this._ws = null;
    this._wsBackoff = 1000;
    this._stopped = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._openDevicesSocket();
    this.addEventListener("sv-device-open", this._onDeviceOpen);
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

  render() {
    return html`
      <main>
        <sv-device-list
          .devices=${this._devices}
          ?ha-ready=${this._haReady}
        ></sv-device-list>
      </main>
    `;
  }

  _openDevicesSocket() {
    if (this._stopped) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const base = location.pathname.replace(/\/$/, "");
    const url = `${proto}//${location.host}${base}/ws/devices`;
    this._ws = new WebSocket(url);
    this._ws.addEventListener("open", () => {
      this._wsBackoff = 1000;
    });
    this._ws.addEventListener("message", (ev) => {
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        return;
      }
      // Server pushes { devices: [...], ha_ready: bool } envelopes.
      if (Array.isArray(payload.devices)) this._devices = payload.devices;
      if (typeof payload.ha_ready === "boolean") this._haReady = payload.ha_ready;
    });
    this._ws.addEventListener("close", () => {
      if (this._stopped) return;
      setTimeout(() => this._openDevicesSocket(), this._wsBackoff);
      this._wsBackoff = Math.min(this._wsBackoff * 2, 15000);
    });
    this._ws.addEventListener("error", () => {
      try {
        this._ws.close();
      } catch {}
    });
  }

  _onDeviceOpen = (ev) => {
    const device = ev.detail.device;
    if (!device || !device.device_id) return;
    const base = location.pathname.replace(/\/$/, "");
    location.href = `${base}/device/${encodeURIComponent(device.device_id)}`;
  };

  static styles = [
    tokens,
    baseFont,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--sv-bg);
        color: var(--sv-fg);
        padding: 24px 20px 40px;
        box-sizing: border-box;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
      }
    `,
  ];
}

customElements.define("sv-app", SvApp);

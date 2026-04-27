import { LitElement, html, css } from "lit";
import { tokens, baseFont, ingressBase, deviceIdFromUrl } from "./sv-shared.js";
import "./sv-device-list.js";
import "./sv-device-detail.js";

// Root component. Owns:
//   - The persistent /ws/devices socket (server pushes JSON device lists)
//   - Client-side routing between list and device-detail views
//   - history.pushState / popstate so back-button navigation works
class SvApp extends LitElement {
  static properties = {
    _devices: { state: true },
    _haReady: { state: true },
    _selectedId: { state: true },
  };

  constructor() {
    super();
    this._devices = [];
    this._haReady = false;
    // Hydrate route from URL so a refresh on /device/<id> stays on the
    // detail page instead of bouncing back to the list.
    this._selectedId = deviceIdFromUrl();
    this._ws = null;
    this._wsBackoff = 1000;
    this._stopped = false;
    this._onPopState = this._onPopState.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this._openDevicesSocket();
    this.addEventListener("sv-device-open", this._onDeviceOpen);
    this.addEventListener("sv-back-to-list", this._onBackToList);
    window.addEventListener("popstate", this._onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopped = true;
    window.removeEventListener("popstate", this._onPopState);
    if (this._ws) {
      try {
        this._ws.close();
      } catch {}
    }
  }

  render() {
    if (this._selectedId) {
      const device =
        this._devices.find((d) => d.device_id === this._selectedId) || null;
      return html`
        <main>
          <sv-device-detail
            .deviceId=${this._selectedId}
            .device=${device}
          ></sv-device-detail>
        </main>
      `;
    }
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
    const url = `${proto}//${location.host}${ingressBase()}/ws/devices`;
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
    const device = ev.detail?.device;
    if (!device || !device.device_id) return;
    this._navigateTo(device.device_id);
  };

  _onBackToList = () => {
    this._navigateTo(null);
  };

  _navigateTo(deviceId) {
    if (this._selectedId === deviceId) return;
    const base = ingressBase();
    const url = deviceId
      ? `${base}/device/${encodeURIComponent(deviceId)}`
      : `${base}/`;
    history.pushState({ deviceId }, "", url);
    this._selectedId = deviceId;
  }

  _onPopState() {
    this._selectedId = deviceIdFromUrl();
  }

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
        max-width: 1200px;
        margin: 0 auto;
      }
    `,
  ];
}

customElements.define("sv-app", SvApp);

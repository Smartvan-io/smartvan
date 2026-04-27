import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";

// LED controller calibration page. One card per strip, each with a
// rename + a num_leds setter. The current num_leds isn't carried in
// HA state, so the input is a "set to" field rather than reflecting
// the persisted value — the firmware reboots to apply.
export class SvLedPage extends LitElement {
  static properties = {
    deviceId: { type: String },
    data: { attribute: false },
    _result: { state: true }, // {strip_n.field: {ok, message}}
    _busy: { state: true },
  };

  constructor() {
    super();
    this.deviceId = "";
    this.data = null;
    this._result = {};
    this._busy = false;
  }

  render() {
    const strips = this.data?.strips || [];
    if (strips.length === 0) {
      return html`
        <section class="card">
          <p class="muted">
            No LED strip entities found for this device. If the device
            just connected, give it a few seconds and refresh.
          </p>
        </section>
      `;
    }
    return html`${strips.map((s) => this._renderStrip(s))}`;
  }

  _renderStrip(strip) {
    const n = strip.n;
    return html`
      <section class="card">
        <div class="card-header">
          <h2>LED Strip ${n}</h2>
          <span class="muted">${strip.entity_id}</span>
        </div>

        <h3>Name</h3>
        <form
          class="inline-form"
          @submit=${(ev) => this._saveName(ev, n)}
        >
          <input
            type="text"
            name="name"
            .value=${strip.name || ""}
            required
          />
          <button type="submit" ?disabled=${this._busy}>Save</button>
        </form>
        ${this._renderResult(`s${n}_name`)}

        <h3>Number of LEDs on the strip</h3>
        <p class="muted">
          Range 1–100. The device will reboot to apply the new count.
        </p>
        <form
          class="inline-form"
          @submit=${(ev) => this._saveNumLeds(ev, n)}
        >
          <input
            type="number"
            name="value"
            min="1"
            max="100"
            step="1"
            placeholder="e.g. 60"
            required
          />
          <button type="submit" ?disabled=${this._busy}>Save</button>
        </form>
        ${this._renderResult(`s${n}_num_leds`)}
      </section>
    `;
  }

  _renderResult(key) {
    const r = this._result[key];
    if (!r) return html`<div class="result"></div>`;
    return html`
      <div class="result ${r.ok ? "ok" : "warn"}">${r.message}</div>
    `;
  }

  async _saveName(ev, n) {
    ev.preventDefault();
    const name = new FormData(ev.target).get("name");
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/led/strip/${n}/rename`,
      { name },
    );
    this._result = { ...this._result, [`s${n}_name`]: result };
    this._busy = false;
  }

  async _saveNumLeds(ev, n) {
    ev.preventDefault();
    const value = new FormData(ev.target).get("value");
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/led/strip/${n}/num_leds`,
      { value },
    );
    this._result = { ...this._result, [`s${n}_num_leds`]: result };
    this._busy = false;
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    css`
      input[type="text"] {
        flex: 1;
        min-width: 200px;
      }
    `,
  ];
}

customElements.define("sv-led-page", SvLedPage);

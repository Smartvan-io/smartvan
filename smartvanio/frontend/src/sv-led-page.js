import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";
import { slCard } from "./sv-shoelace.js";

// LED controller calibration page. One sl-card per strip with a rename and a
// num_leds setter. num_leds isn't carried in HA state, so that field is a
// "set to" value rather than the persisted count — the firmware reboots to
// apply.
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
        <sl-card>
          <p class="muted">
            No LED strip entities found for this device. If it just connected,
            give it a few seconds and refresh.
          </p>
        </sl-card>
      `;
    }
    return html`${strips.map((s) => this._renderStrip(s))}`;
  }

  _renderStrip(strip) {
    const n = strip.n;
    return html`
      <sl-card>
        <div slot="header">
          <h2>LED Strip ${n}</h2>
          <span class="muted">${strip.entity_id}</span>
        </div>

        <h3>Name</h3>
        <div class="row">
          <sl-input
            size="small"
            class="grow"
            .value=${strip.name || ""}
            id=${`name-${n}`}
          ></sl-input>
          <sl-button
            variant="primary"
            ?disabled=${this._busy}
            @click=${() => this._saveName(n)}
            >Save name</sl-button
          >
        </div>
        ${this._renderResult(`s${n}_name`)}

        <h3>Number of LEDs on the strip</h3>
        <p class="muted">Range 1–100. The device reboots to apply the count.</p>
        <div class="row">
          <sl-input
            type="number"
            size="small"
            min="1"
            max="100"
            step="1"
            placeholder="e.g. 60"
            class="num"
            id=${`num-${n}`}
          ></sl-input>
          <sl-button
            variant="primary"
            ?disabled=${this._busy}
            @click=${() => this._saveNumLeds(n)}
            >Apply &amp; reboot</sl-button
          >
        </div>
        ${this._renderResult(`s${n}_num_leds`)}
      </sl-card>
    `;
  }

  _renderResult(key) {
    const r = this._result[key];
    if (!r) return null;
    return html`
      <sl-alert variant=${r.ok ? "success" : "danger"} open class="status"
        >${r.message}</sl-alert
      >
    `;
  }

  async _saveName(n) {
    const input = this.renderRoot.querySelector(`#name-${n}`);
    const name = input ? input.value : "";
    if (!name) return;
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/led/strip/${n}/rename`,
      { name },
    );
    this._result = { ...this._result, [`s${n}_name`]: result };
    this._busy = false;
  }

  async _saveNumLeds(n) {
    const input = this.renderRoot.querySelector(`#num-${n}`);
    const value = input ? input.value : "";
    if (!value) return;
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
    slCard,
    css`
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .grow {
        flex: 1;
        min-width: 200px;
      }
      .num {
        width: 140px;
      }
      .status {
        margin-top: 12px;
      }
      .status::part(base) {
        padding: 8px 14px;
      }
    `,
  ];
}

customElements.define("sv-led-page", SvLedPage);

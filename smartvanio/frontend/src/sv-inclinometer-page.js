import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";
import { slCard } from "./sv-shoelace.js";

// Inclinometer calibration page. Live values are pushed in via the `live`
// property on every WS frame. All controls are Shoelace.
export class SvInclinometerPage extends LitElement {
  static properties = {
    deviceId: { type: String },
    data: { attribute: false },
    live: { attribute: false },
    _orientationResult: { state: true },
    _pitchResult: { state: true },
    _rollResult: { state: true },
    _busy: { state: true },
  };

  constructor() {
    super();
    this.deviceId = "";
    this.data = null;
    this.live = {};
    this._orientationResult = null;
    this._pitchResult = null;
    this._rollResult = null;
    this._busy = false;
  }

  render() {
    const d = this.data || {};
    const pitch = this._liveValue("adjusted_pitch_angle", d.pitch_value);
    const roll = this._liveValue("adjusted_roll_angle", d.roll_value);
    const orientation = this._liveValue("orientation", d.orientation_value);

    return html`
      <sl-card>
        <div slot="header"><h2>Live readings</h2></div>
        <div class="live-grid">
          ${this._angleCard("pitch", pitch)} ${this._angleCard("roll", roll)}
        </div>
      </sl-card>

      <sl-card>
        <div slot="header"><h2>Orientation</h2></div>
        <p class="muted">Pick the face of the board that is mounted up.</p>
        <div class="row">
          <sl-select
            size="small"
            class="grow"
            .value=${orientation || ""}
            @sl-change=${(e) => this._saveOrientation(e.target.value)}
          >
            ${(d.orientation_options || []).map(
              (opt) => html`<sl-option value=${opt}>${opt}</sl-option>`,
            )}
          </sl-select>
        </div>
        ${this._renderResult(this._orientationResult)}
      </sl-card>

      ${["pitch", "roll"].map((axis) =>
        this._compensationCard(
          axis,
          axis === "pitch" ? d.pitch_compensation : d.roll_compensation,
        ),
      )}
    `;
  }

  _angleCard(axis, value) {
    const display = value == null ? "—" : Number(value).toFixed(1);
    return html`
      <div class="angle-card">
        <div class="angle-axis">${axis}</div>
        <div class="angle-value">${display}<span class="angle-unit">°</span></div>
      </div>
    `;
  }

  _compensationCard(axis, initialValue) {
    const result = axis === "pitch" ? this._pitchResult : this._rollResult;
    const label = axis[0].toUpperCase() + axis.slice(1);
    return html`
      <sl-card>
        <div slot="header"><h2>${label} compensation</h2></div>
        <p class="muted">
          Manual offset (in degrees) added to the ${axis} reading.
        </p>
        <div class="row">
          <sl-input
            type="number"
            size="small"
            step="0.1"
            class="comp"
            .value=${initialValue == null ? "0" : String(initialValue)}
            id=${`comp-${axis}`}
          ></sl-input>
          <sl-button
            variant="primary"
            ?disabled=${this._busy}
            @click=${() => this._saveCompensation(axis)}
            >Save</sl-button
          >
        </div>
        <div class="button-row">
          <sl-button
            ?disabled=${this._busy}
            @click=${() => this._calibrate(axis, "calibrate")}
            >Calibrate from current position</sl-button
          >
          <sl-button
            ?disabled=${this._busy}
            @click=${() => this._calibrate(axis, "reset")}
            >Reset to zero</sl-button
          >
        </div>
        ${this._renderResult(result)}
      </sl-card>
    `;
  }

  _renderResult(result) {
    if (!result) return null;
    return html`
      <sl-alert variant=${result.ok ? "success" : "danger"} open class="status"
        >${result.message}</sl-alert
      >
    `;
  }

  _liveValue(channel, fallback) {
    const live = this.live?.[channel];
    if (live && live.value != null) return live.value;
    return fallback;
  }

  async _saveOrientation(option) {
    this._busy = true;
    this._orientationResult = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/inclinometer/orientation`,
      { option },
    );
    this._busy = false;
  }

  async _saveCompensation(axis) {
    const input = this.renderRoot.querySelector(`#comp-${axis}`);
    const value = input ? input.value : "0";
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/inclinometer/${axis}-compensation`,
      { value },
    );
    if (axis === "pitch") this._pitchResult = result;
    else this._rollResult = result;
    this._busy = false;
  }

  async _calibrate(axis, action) {
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/inclinometer/${action}-${axis}`,
      {},
    );
    if (axis === "pitch") this._pitchResult = result;
    else this._rollResult = result;
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
        max-width: 320px;
      }
      .comp {
        width: 140px;
      }
      .status {
        margin-top: 12px;
      }
      .status::part(base) {
        padding: 8px 14px;
      }
      .button-row {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }
    `,
  ];
}

customElements.define("sv-inclinometer-page", SvInclinometerPage);

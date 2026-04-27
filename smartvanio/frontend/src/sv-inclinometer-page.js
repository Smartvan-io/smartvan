import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";

// Inclinometer calibration page. Stateless w.r.t. live values — those
// are pushed in via the `live` property on every WS frame.
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
      <section class="card">
        <div class="card-header"><h2>Live readings</h2></div>
        <div class="live-grid">
          ${this._angleCard("pitch", pitch)} ${this._angleCard("roll", roll)}
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>Orientation</h2></div>
        <p class="muted">Pick the face of the board that is mounted up.</p>
        <form class="inline-form" @submit=${this._saveOrientation}>
          <select name="option" .value=${orientation || ""} required>
            ${(d.orientation_options || []).map(
              (opt) => html`
                <option value=${opt} ?selected=${opt === orientation}>
                  ${opt}
                </option>
              `,
            )}
          </select>
          <button type="submit" ?disabled=${this._busy}>Save</button>
        </form>
        ${this._renderResult(this._orientationResult)}
      </section>

      ${["pitch", "roll"].map((axis) =>
        this._compensationCard(axis, axis === "pitch" ? d.pitch_compensation : d.roll_compensation),
      )}
    `;
  }

  _angleCard(axis, value) {
    const display = value == null ? "—" : Number(value).toFixed(1);
    return html`
      <div class="angle-card">
        <div class="angle-axis">${axis}</div>
        <div class="angle-value">
          ${display}<span class="angle-unit">°</span>
        </div>
      </div>
    `;
  }

  _compensationCard(axis, initialValue) {
    const result = axis === "pitch" ? this._pitchResult : this._rollResult;
    return html`
      <section class="card">
        <div class="card-header">
          <h2>${axis[0].toUpperCase() + axis.slice(1)} compensation</h2>
        </div>
        <p class="muted">Manual offset (in degrees) added to the ${axis} reading.</p>
        <form
          class="inline-form"
          @submit=${(ev) => this._saveCompensation(ev, axis)}
        >
          <input
            type="number"
            name="value"
            step="0.1"
            .value=${initialValue == null ? "0" : String(initialValue)}
            required
          />
          <button type="submit" ?disabled=${this._busy}>Save</button>
        </form>
        <div class="button-row">
          <button
            type="button"
            class="secondary"
            ?disabled=${this._busy}
            @click=${() => this._calibrate(axis, "calibrate")}
          >
            Calibrate from current position
          </button>
          <button
            type="button"
            class="secondary"
            ?disabled=${this._busy}
            @click=${() => this._calibrate(axis, "reset")}
          >
            Reset to zero
          </button>
        </div>
        ${this._renderResult(result)}
      </section>
    `;
  }

  _renderResult(result) {
    if (!result) return html`<div class="result"></div>`;
    return html`
      <div class="result ${result.ok ? "ok" : "warn"}">${result.message}</div>
    `;
  }

  _liveValue(channel, fallback) {
    const live = this.live?.[channel];
    if (live && live.value != null) return live.value;
    return fallback;
  }

  async _saveOrientation(ev) {
    ev.preventDefault();
    const option = new FormData(ev.target).get("option");
    this._busy = true;
    this._orientationResult = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/inclinometer/orientation`,
      { option },
    );
    this._busy = false;
  }

  async _saveCompensation(ev, axis) {
    ev.preventDefault();
    const value = new FormData(ev.target).get("value");
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

  static styles = [tokens, baseFont, widgets, css``];
}

customElements.define("sv-inclinometer-page", SvInclinometerPage);

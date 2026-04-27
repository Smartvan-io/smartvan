import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";

// Resistive sensor calibration page. Renders one card per sensor (1, 2)
// with the interpolation editor + limits. Add/Remove rows are pure
// client-side state changes — Save POSTs the full points array.
export class SvResistivePage extends LitElement {
  static properties = {
    deviceId: { type: String },
    data: { attribute: false },
    live: { attribute: false },
    _localPoints: { state: true }, // {1: [[v,p],...], 2: [...]}
    _result: { state: true }, // {sensor_n.field: {ok, message}}
    _busy: { state: true },
  };

  constructor() {
    super();
    this.deviceId = "";
    this.data = null;
    this.live = {};
    this._localPoints = {};
    this._result = {};
    this._busy = false;
  }

  willUpdate(changed) {
    // Seed local point state from the hydration payload exactly once.
    // After that, the user's edits live in `_localPoints` and we only
    // overwrite if the data prop is replaced (i.e. fresh hydration on
    // device switch).
    if (changed.has("data") && this.data) {
      const seeded = {};
      for (const sensor of this.data.sensors || []) {
        if (this._localPoints[sensor.n] == null) {
          seeded[sensor.n] = (sensor.points || []).map((p) => [...p]);
        }
      }
      if (Object.keys(seeded).length) {
        this._localPoints = { ...this._localPoints, ...seeded };
      }
    }
  }

  render() {
    const sensors = this.data?.sensors || [];
    return html`${sensors.map((s) => this._renderSensor(s))}`;
  }

  _renderSensor(sensor) {
    const n = sensor.n;
    const raw = this._liveValue(`sensor_${n}_raw`, sensor.raw_value);
    const interp = this._liveValue(
      `sensor_${n}_interpolated_value`,
      sensor.interpolated_value,
    );
    const open = this._liveBool(`sensor_${n}_input_open`, sensor.input_open);
    const points = this._localPoints[n] || [];

    return html`
      <section class="card">
        <div class="card-header">
          <h2>Sensor ${n}</h2>
          ${open
            ? html`<span class="muted"
                ><span class="dot dot-warn"></span>open circuit</span
              >`
            : null}
        </div>

        <div class="live-grid">
          ${this._readout("raw voltage", raw, "V")}
          ${this._readout("interpolated", interp, "")}
        </div>

        <h3>Calibration points</h3>
        <p class="muted">
          Each point maps a measured voltage to an output value. Add at least
          two points; more give a finer curve.
        </p>
        <div class="points-editor">
          ${points.length === 0
            ? html`<p class="muted">No points yet — add some.</p>`
            : points.map(
                ([v, p], i) => html`
                  <div class="point-row">
                    <input
                      type="number"
                      step="any"
                      .value=${String(v)}
                      @input=${(e) => this._editPoint(n, i, 0, e.target.value)}
                    />
                    <span class="muted">V →</span>
                    <input
                      type="number"
                      step="any"
                      .value=${String(p)}
                      @input=${(e) => this._editPoint(n, i, 1, e.target.value)}
                    />
                    <button
                      type="button"
                      class="secondary remove-point"
                      aria-label="remove"
                      @click=${() => this._removePoint(n, i)}
                    >
                      ×
                    </button>
                  </div>
                `,
              )}
          <div class="button-row">
            <button
              type="button"
              class="secondary"
              @click=${() => this._addPoint(n)}
            >
              + Add point
            </button>
            <button
              type="button"
              ?disabled=${this._busy}
              @click=${() => this._savePoints(n)}
            >
              Save
            </button>
          </div>
        </div>
        ${this._renderResult(`s${n}_points`)}

        <h3>Interpolation method</h3>
        <form
          class="inline-form"
          @submit=${(ev) => this._saveSelect(ev, n, "interpolation-kind")}
        >
          <select name="option" .value=${sensor.kind_value || ""} required>
            ${(sensor.kind_options || []).map(
              (opt) => html`
                <option value=${opt} ?selected=${opt === sensor.kind_value}>
                  ${opt}
                </option>
              `,
            )}
          </select>
          <button type="submit" ?disabled=${this._busy}>Save</button>
        </form>
        ${this._renderResult(`s${n}_interpolation-kind`)}

        <h3>Limits</h3>
        ${this._numberField(n, "min-resistance", "Min resistance (Ω)", sensor.min_r)}
        ${this._numberField(n, "max-resistance", "Max resistance (Ω)", sensor.max_r)}
        ${this._numberField(
          n,
          "threshold",
          "Open-circuit threshold (V)",
          sensor.threshold,
        )}
      </section>
    `;
  }

  _readout(label, value, unit) {
    const display = value == null || value === "" ? "—" : value;
    return html`
      <div class="angle-card">
        <div class="angle-axis">${label}</div>
        <div class="angle-value">
          ${display}${unit ? html`<span class="angle-unit">${unit}</span>` : null}
        </div>
      </div>
    `;
  }

  _numberField(n, field, label, initial) {
    return html`
      <form
        class="inline-form"
        style="margin-top:8px"
        @submit=${(ev) => this._saveNumber(ev, n, field)}
      >
        <label>
          ${label}
          <input
            type="number"
            name="value"
            step="any"
            .value=${initial == null ? "" : String(initial)}
            required
          />
        </label>
        <button type="submit" ?disabled=${this._busy}>Save</button>
      </form>
      ${this._renderResult(`s${n}_${field}`)}
    `;
  }

  _renderResult(key) {
    const r = this._result[key];
    if (!r) return html`<div class="result"></div>`;
    return html`
      <div class="result ${r.ok ? "ok" : "warn"}">${r.message}</div>
    `;
  }

  _liveValue(channel, fallback) {
    const live = this.live?.[channel];
    if (live && live.value != null && live.value !== "") return live.value;
    return fallback;
  }

  _liveBool(channel, fallback) {
    const live = this.live?.[channel];
    if (live) return live.value === "on";
    return Boolean(fallback);
  }

  _editPoint(n, i, col, raw) {
    const value = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(value)) return;
    const points = (this._localPoints[n] || []).map((row) => [...row]);
    if (!points[i]) return;
    points[i][col] = value;
    this._localPoints = { ...this._localPoints, [n]: points };
  }

  _addPoint(n) {
    const points = [...(this._localPoints[n] || []), [0, 0]];
    this._localPoints = { ...this._localPoints, [n]: points };
  }

  _removePoint(n, i) {
    const points = (this._localPoints[n] || []).filter((_, idx) => idx !== i);
    this._localPoints = { ...this._localPoints, [n]: points };
  }

  async _savePoints(n) {
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/resistive/${n}/points/save`,
      { points: this._localPoints[n] || [] },
    );
    this._result = { ...this._result, [`s${n}_points`]: result };
    if (result.ok && Array.isArray(result.points)) {
      this._localPoints = {
        ...this._localPoints,
        [n]: result.points.map((p) => [...p]),
      };
    }
    this._busy = false;
  }

  async _saveNumber(ev, n, field) {
    ev.preventDefault();
    const value = new FormData(ev.target).get("value");
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/resistive/${n}/${field}`,
      { value },
    );
    this._result = { ...this._result, [`s${n}_${field}`]: result };
    this._busy = false;
  }

  async _saveSelect(ev, n, field) {
    ev.preventDefault();
    const option = new FormData(ev.target).get("option");
    this._busy = true;
    const result = await postJson(
      `/api/device/${encodeURIComponent(this.deviceId)}/resistive/${n}/${field}`,
      { option },
    );
    this._result = { ...this._result, [`s${n}_${field}`]: result };
    this._busy = false;
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    css`
      .points-editor {
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: var(--sv-input);
        border: 1px solid var(--sv-border);
        border-radius: 8px;
        padding: 12px;
      }
      .point-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .point-row input[type="number"] {
        width: 100px;
      }
      .remove-point {
        width: 32px;
        padding: 4px 0;
        text-align: center;
        line-height: 1;
      }
    `,
  ];
}

customElements.define("sv-resistive-page", SvResistivePage);

import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";
import { slCard } from "./sv-shoelace.js";

// Resistive sensor calibration page. One sl-card per sensor with the
// interpolation editor, method and limits. Edits are held in local state and
// persisted together by a single "Save calibration" button per sensor (each
// changed field still POSTs to its own endpoint under the hood).

const NUMBER_FIELDS = {
  min_r: "min-resistance",
  max_r: "max-resistance",
  threshold: "threshold",
};

const cloneSnap = (s) => ({ ...s, points: s.points.map((p) => [...p]) });

export class SvResistivePage extends LitElement {
  static properties = {
    deviceId: { type: String },
    data: { attribute: false },
    live: { attribute: false },
    _local: { state: true },
    _saved: { state: true },
    _status: { state: true },
    _busy: { state: true },
  };

  constructor() {
    super();
    this.deviceId = "";
    this.data = null;
    this.live = {};
    this._local = {};
    this._saved = {};
    this._status = {};
    this._busy = {};
  }

  willUpdate(changed) {
    if (changed.has("data") && this.data) {
      const local = { ...this._local };
      const saved = { ...this._saved };
      for (const s of this.data.sensors || []) {
        if (local[s.n] == null) {
          const snap = {
            points: (s.points || []).map((p) => [...p]),
            kind: s.kind_value || "",
            min_r: s.min_r == null ? "" : String(s.min_r),
            max_r: s.max_r == null ? "" : String(s.max_r),
            threshold: s.threshold == null ? "" : String(s.threshold),
          };
          local[s.n] = snap;
          saved[s.n] = cloneSnap(snap);
        }
      }
      this._local = local;
      this._saved = saved;
    }
  }

  render() {
    const sensors = this.data?.sensors || [];
    return html`${sensors.map((s) => this._renderSensor(s))}`;
  }

  _renderSensor(sensor) {
    const n = sensor.n;
    const local = this._local[n];
    if (!local) return null;
    const raw = this._liveValue(`sensor_${n}_raw`, sensor.raw_value);
    const interp = this._liveValue(
      `sensor_${n}_interpolated_value`,
      sensor.interpolated_value,
    );
    const open = this._liveBool(`sensor_${n}_input_open`, sensor.input_open);
    const dirty = this._isDirty(n);
    const busy = !!this._busy[n];
    const status = this._status[n];

    return html`
      <sl-card>
        <div slot="header">
          <h2>Sensor ${n}</h2>
          ${open
            ? html`<sl-tag variant="warning" size="small" pill
                >open circuit</sl-tag
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
          two; more points give a finer curve.
        </p>
        <div class="points">
          ${local.points.length === 0
            ? html`<p class="muted">No points yet — add one below.</p>`
            : local.points.map(
                ([v, p], i) => html`
                  <div class="point-row">
                    <sl-input
                      type="number"
                      size="small"
                      step="any"
                      .value=${String(v)}
                      @sl-input=${(e) => this._editPoint(n, i, 0, e.target.value)}
                    ></sl-input>
                    <span class="muted">V →</span>
                    <sl-input
                      type="number"
                      size="small"
                      step="any"
                      .value=${String(p)}
                      @sl-input=${(e) => this._editPoint(n, i, 1, e.target.value)}
                    ></sl-input>
                    <sl-button
                      size="small"
                      circle
                      aria-label="Remove point"
                      @click=${() => this._removePoint(n, i)}
                      >×</sl-button
                    >
                  </div>
                `,
              )}
          <sl-button size="small" @click=${() => this._addPoint(n)}
            >+ Add point</sl-button
          >
        </div>

        <h3>Interpolation method</h3>
        <sl-select
          size="small"
          class="method"
          .value=${local.kind}
          @sl-change=${(e) => this._edit(n, "kind", e.target.value)}
        >
          ${(sensor.kind_options || []).map(
            (opt) => html`<sl-option value=${opt}>${opt}</sl-option>`,
          )}
        </sl-select>

        <h3>Limits</h3>
        <div class="limits">
          <sl-input
            type="number"
            size="small"
            step="any"
            label="Min resistance (Ω)"
            .value=${local.min_r}
            @sl-input=${(e) => this._edit(n, "min_r", e.target.value)}
          ></sl-input>
          <sl-input
            type="number"
            size="small"
            step="any"
            label="Max resistance (Ω)"
            .value=${local.max_r}
            @sl-input=${(e) => this._edit(n, "max_r", e.target.value)}
          ></sl-input>
          <sl-input
            type="number"
            size="small"
            step="any"
            label="Open-circuit threshold (V)"
            .value=${local.threshold}
            @sl-input=${(e) => this._edit(n, "threshold", e.target.value)}
          ></sl-input>
        </div>

        <div class="save-bar">
          <sl-button
            variant="primary"
            ?disabled=${!dirty || busy}
            ?loading=${busy}
            @click=${() => this._save(n)}
            >${dirty ? "Save calibration" : "Saved"}</sl-button
          >
          ${status
            ? html`<sl-alert
                variant=${status.ok ? "success" : "danger"}
                open
                class="status"
                >${status.message}</sl-alert
              >`
            : null}
        </div>
      </sl-card>
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

  _isDirty(n) {
    return JSON.stringify(this._local[n]) !== JSON.stringify(this._saved[n]);
  }

  _edit(n, field, value) {
    this._local = {
      ...this._local,
      [n]: { ...this._local[n], [field]: value },
    };
    if (this._status[n]) this._status = { ...this._status, [n]: null };
  }

  _editPoint(n, i, col, raw) {
    const value = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(value)) return;
    const points = this._local[n].points.map((row) => [...row]);
    if (!points[i]) return;
    points[i][col] = value;
    this._edit(n, "points", points);
  }

  _addPoint(n) {
    this._edit(n, "points", [...this._local[n].points, [0, 0]]);
  }

  _removePoint(n, i) {
    this._edit(
      n,
      "points",
      this._local[n].points.filter((_, idx) => idx !== i),
    );
  }

  async _save(n) {
    const local = this._local[n];
    const saved = this._saved[n];
    const id = encodeURIComponent(this.deviceId);
    const calls = [];

    if (JSON.stringify(local.points) !== JSON.stringify(saved.points)) {
      calls.push(
        postJson(`/api/device/${id}/resistive/${n}/points/save`, {
          points: local.points,
        }),
      );
    }
    if (local.kind !== saved.kind) {
      calls.push(
        postJson(`/api/device/${id}/resistive/${n}/interpolation-kind`, {
          option: local.kind,
        }),
      );
    }
    for (const [key, seg] of Object.entries(NUMBER_FIELDS)) {
      if (local[key] !== saved[key]) {
        calls.push(
          postJson(`/api/device/${id}/resistive/${n}/${seg}`, {
            value: local[key],
          }),
        );
      }
    }

    if (calls.length === 0) return;
    this._busy = { ...this._busy, [n]: true };
    const results = await Promise.all(calls);
    this._busy = { ...this._busy, [n]: false };

    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      this._saved = { ...this._saved, [n]: cloneSnap(local) };
      this._status = {
        ...this._status,
        [n]: { ok: true, message: "Calibration saved." },
      };
    } else {
      this._status = {
        ...this._status,
        [n]: {
          ok: false,
          message:
            failed[0].message || `${failed.length} change(s) failed to save.`,
        },
      };
    }
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    slCard,
    css`
      .points {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
      }
      .point-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .point-row sl-input {
        width: 130px;
      }
      .method {
        max-width: 280px;
      }
      .limits {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .save-bar {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-top: 22px;
        flex-wrap: wrap;
      }
      /* sl-alert's :host is display:contents, so the flex item is the base
         part — sizing rules must target it, not .status. Shoelace also puts
         the alert's padding on the message part, which is why padding base
         alone left it ~60px tall next to a 40px button. */
      .save-bar .status::part(base) {
        min-height: var(--sl-input-height-medium, 2.5rem);
        align-items: center;
        padding: 0;
      }
      .save-bar .status::part(message) {
        padding: 0 14px;
      }
    `,
  ];
}

customElements.define("sv-resistive-page", SvResistivePage);

import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets } from "./sv-shared.js";

export class SvDeviceUnknownPage extends LitElement {
  static properties = {
    device: { attribute: false },
  };

  constructor() {
    super();
    this.device = null;
  }

  render() {
    const d = this.device || {};
    return html`
      <section class="card">
        <div class="card-header"><h2>Calibration not available</h2></div>
        <p>
          This device is connected and recognised by SmartVan.io, but its model
          doesn't have a calibration page in this version of the add-on.
        </p>
        <p class="muted">
          Detected model: <code>${d.model || "unknown"}</code> · Device id:
          <code>${d.device_id || ""}</code>
        </p>

        <h3>What works for this device</h3>
        <ul class="muted">
          <li>
            It still appears in Home Assistant as a normal device, with all its
            entities exposed for use in dashboards, automations, and scripts.
          </li>
          <li>
            If it's an LED controller, you can configure segments and scenes
            from the SmartVan.io main card on the dashboard.
          </li>
        </ul>

        <h3>v1 calibration coverage</h3>
        <p class="muted">v1 of this add-on covers two device types:</p>
        <ul class="muted">
          <li>
            <strong>Inclinometer</strong> — orientation, pitch / roll
            compensation, calibrate-from-current, reset.
          </li>
          <li>
            <strong>Resistive sensor</strong> — interpolation points, kind, min
            / max resistance, open-circuit threshold.
          </li>
        </ul>
      </section>
    `;
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    css`
      code {
        background: var(--sv-input);
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 0.9em;
      }
      ul {
        margin: 6px 0 0 18px;
      }
      li {
        margin: 6px 0;
      }
    `,
  ];
}

customElements.define("sv-device-unknown-page", SvDeviceUnknownPage);

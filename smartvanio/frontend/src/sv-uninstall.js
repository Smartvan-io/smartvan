import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";

// Uninstall section, shown at the bottom of the device list. Runs the
// server-side cleanup (integration, cards, dashboard, Lovelace regs) via
// POST /api/uninstall, then instructs the user to remove the add-on from
// Supervisor. Two-step confirm so a stray tap can't wipe the install.
export class SvUninstall extends LitElement {
  static properties = {
    _confirming: { state: true },
    _busy: { state: true },
    _result: { state: true }, // {ok, message} | null
  };

  constructor() {
    super();
    this._confirming = false;
    this._busy = false;
    this._result = null;
  }

  render() {
    // Once cleanup has succeeded, swap the controls for the done message.
    if (this._result?.ok) {
      return html`
        <section class="card danger-zone">
          <div class="card-header"><h2>Uninstall</h2></div>
          <div class="result ok">
            <strong>Cleanup complete.</strong>
            The integration, cards, dashboard and Lovelace registrations have
            been removed and Home Assistant is restarting. Once it's back up,
            finish by going to
            <strong>Settings → Add-ons → SmartVan.io → ⋮ → Uninstall</strong>.
          </div>
        </section>
      `;
    }

    return html`
      <section class="card danger-zone">
        <div class="card-header"><h2>Uninstall</h2></div>
        <p class="muted">
          Removes the SmartVan.io integration, dashboard cards, dashboard and
          Lovelace registrations, then restarts Home Assistant. Your Mosquitto
          broker, MQTT settings and device credentials are left untouched. Run
          this <strong>before</strong> removing the add-on from Supervisor.
        </p>

        ${this._result && !this._result.ok
          ? html`<div class="result warn">${this._result.message}</div>`
          : null}

        ${this._confirming
          ? html`
              <div class="button-row">
                <button
                  class="danger"
                  ?disabled=${this._busy}
                  @click=${this._runCleanup}
                >
                  ${this._busy ? "Cleaning up…" : "Yes, clean up now"}
                </button>
                <button
                  class="secondary"
                  ?disabled=${this._busy}
                  @click=${() => (this._confirming = false)}
                >
                  Cancel
                </button>
              </div>
            `
          : html`
              <div class="button-row">
                <button
                  class="danger"
                  @click=${() => (this._confirming = true)}
                >
                  Clean up &amp; prepare for uninstall
                </button>
              </div>
            `}
      </section>
    `;
  }

  async _runCleanup() {
    this._busy = true;
    this._result = null;
    this._result = await postJson("/api/uninstall", { confirm: "yes" });
    this._busy = false;
    if (this._result?.ok) this._confirming = false;
  }

  static styles = [
    tokens,
    baseFont,
    widgets,
    css`
      .danger-zone {
        border-color: rgba(239, 68, 68, 0.35);
        margin-top: 32px;
      }
      .danger-zone h2 {
        color: var(--sv-danger);
      }
    `,
  ];
}

customElements.define("sv-uninstall", SvUninstall);

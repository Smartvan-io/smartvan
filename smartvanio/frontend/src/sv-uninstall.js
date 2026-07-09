import { LitElement, html, css } from "lit";
import { tokens, baseFont, widgets, postJson } from "./sv-shared.js";
import { slCard } from "./sv-shoelace.js";

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
    if (this._result?.ok) {
      return html`
        <sl-card class="danger-zone">
          <div slot="header"><h2>Uninstall</h2></div>
          <sl-alert variant="success" open>
            <strong>Cleanup complete.</strong> The integration, cards, dashboard
            and Lovelace registrations have been removed and Home Assistant is
            restarting. Once it's back up, finish by going to
            <strong>Settings → Add-ons → SmartVan.io → ⋮ → Uninstall</strong>.
          </sl-alert>
        </sl-card>
      `;
    }

    return html`
      <sl-card class="danger-zone">
        <div slot="header"><h2>Uninstall</h2></div>
        <p class="muted">
          Removes the SmartVan.io integration, dashboard cards, dashboard and
          Lovelace registrations, then restarts Home Assistant. Your Mosquitto
          broker, MQTT settings and device credentials are left untouched. Run
          this <strong>before</strong> removing the add-on from Supervisor.
        </p>

        ${this._result && !this._result.ok
          ? html`<sl-alert variant="danger" open class="err"
              >${this._result.message}</sl-alert
            >`
          : null}

        ${this._confirming
          ? html`
              <div class="button-row">
                <sl-button
                  variant="danger"
                  ?loading=${this._busy}
                  @click=${this._runCleanup}
                  >Yes, clean up now</sl-button
                >
                <sl-button
                  ?disabled=${this._busy}
                  @click=${() => (this._confirming = false)}
                  >Cancel</sl-button
                >
              </div>
            `
          : html`
              <div class="button-row">
                <sl-button
                  variant="danger"
                  @click=${() => (this._confirming = true)}
                  >Clean up &amp; prepare for uninstall</sl-button
                >
              </div>
            `}
      </sl-card>
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
    slCard,
    css`
      .danger-zone {
        margin-top: 32px;
      }
      .danger-zone::part(base) {
        border-color: rgba(239, 68, 68, 0.35);
      }
      .danger-zone [slot="header"] h2 {
        color: var(--sv-danger);
      }
      .button-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .err {
        margin-bottom: 12px;
      }
    `,
  ];
}

customElements.define("sv-uninstall", SvUninstall);

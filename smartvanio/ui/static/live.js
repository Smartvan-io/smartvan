// Spike-scope WS client. Opens /ws/echo relative to the current
// document location (so it inherits the Ingress prefix automatically),
// echoes whatever the form submits, logs round-trips.
//
// Will be generalised in task #7 (HA WS client + device list page) into
// a fragment-replacement helper that listens on /ws/devices and
// /ws/device/<id> and swaps named DOM regions with incoming HTML.

(function () {
    "use strict";

    function wsUrl(path) {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        // Strip trailing slash on the base path so we can concatenate cleanly.
        const base = location.pathname.replace(/\/$/, "");
        return `${proto}//${location.host}${base}${path}`;
    }

    function init() {
        const form = document.getElementById("ws-form");
        const input = document.getElementById("ws-input");
        const log = document.getElementById("ws-log");
        if (!form || !input || !log) return;

        const append = (line) => {
            log.textContent += line + "\n";
            log.scrollTop = log.scrollHeight;
        };

        const ws = new WebSocket(wsUrl("/ws/echo"));
        ws.addEventListener("open", () => append("[ws] open"));
        ws.addEventListener("close", () => append("[ws] closed"));
        ws.addEventListener("error", () => append("[ws] error"));
        ws.addEventListener("message", (ev) => append(`< ${ev.data}`));

        form.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const value = input.value.trim();
            if (!value) return;
            if (ws.readyState !== WebSocket.OPEN) {
                append("[ws] not open");
                return;
            }
            append(`> ${value}`);
            ws.send(value);
            input.value = "";
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

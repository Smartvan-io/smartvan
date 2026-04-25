// Generic WebSocket fragment-replacer + device-modal opener.
//
// For every element with `data-ws="/ws/path"`, opens a WS to that
// path (relative to current document location, so the Ingress prefix
// is preserved automatically) and replaces named DOM regions when
// envelopes arrive of the form:
//   { "target": "#some-id", "html": "<...>" }
//
// Auto-reconnects with exponential backoff. Re-scans the DOM after
// htmx swaps so WS attachments inside swapped-in fragments still work.

(function () {
    "use strict";

    function wsUrl(path) {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const base = location.pathname.replace(/\/$/, "");
        return `${proto}//${location.host}${base}${path}`;
    }

    function applyEnvelope(env) {
        if (!env || !env.target) return;
        const el = document.querySelector(env.target);
        if (!el) return;
        el.innerHTML = env.html;
        // The injected fragment contains hx-* attributes (e.g. the
        // device buttons in /ws/devices). Without htmx.process the
        // new nodes have no click handlers and clicking does nothing.
        if (window.htmx) window.htmx.process(el);
    }

    function attach(host) {
        if (host.dataset.wsAttached === "1") return;
        const path = host.getAttribute("data-ws");
        if (!path) return;
        host.dataset.wsAttached = "1";
        let ws = null;
        let backoff = 1000;
        let stopped = false;

        function open() {
            if (stopped) return;
            ws = new WebSocket(wsUrl(path));
            ws.addEventListener("open", () => {
                backoff = 1000;
                host.dataset.wsState = "open";
            });
            ws.addEventListener("message", (ev) => {
                let env;
                try { env = JSON.parse(ev.data); } catch (e) { return; }
                applyEnvelope(env);
            });
            ws.addEventListener("close", () => {
                host.dataset.wsState = "closed";
                if (stopped) return;
                setTimeout(open, backoff);
                backoff = Math.min(backoff * 2, 15000);
            });
            ws.addEventListener("error", () => {
                try { ws.close(); } catch (e) {}
            });
        }

        open();

        const observer = new MutationObserver(() => {
            if (!document.contains(host)) {
                stopped = true;
                if (ws) try { ws.close(); } catch (e) {}
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function scan(root) {
        (root || document).querySelectorAll("[data-ws]").forEach(attach);
    }

    // ── Device modal wiring ────────────────────────────────────
    function openDeviceModal() {
        const modal = document.getElementById("device-modal");
        if (modal && typeof modal.showModal === "function" && !modal.open) {
            modal.showModal();
        }
    }
    function closeDeviceModal() {
        const modal = document.getElementById("device-modal");
        if (modal && modal.open) modal.close();
        // Content is cleared in the modal's "close" handler so the
        // device's WebSocket tears down regardless of how it closed.
    }

    function initModal() {
        const modal = document.getElementById("device-modal");
        if (!modal) return;
        // Click on backdrop closes the modal.
        modal.addEventListener("click", (ev) => {
            if (ev.target === modal) closeDeviceModal();
        });
        // Close button (delegated; markup is swapped in by htmx).
        modal.addEventListener("click", (ev) => {
            if (ev.target.closest("[data-modal-close]")) closeDeviceModal();
        });
        // ESC fires <dialog>'s native close event; purge content too.
        modal.addEventListener("close", () => {
            const content = document.getElementById("device-modal-content");
            if (content) content.innerHTML = "";
        });
    }

    function init() {
        scan();
        initModal();

        // After any htmx swap, re-scan for new [data-ws] hosts and
        // open the modal if the swap targeted its content area.
        document.body.addEventListener("htmx:afterSwap", (ev) => {
            const target = ev.detail && ev.detail.target;
            if (target) scan(target);
            if (target && target.id === "device-modal-content") {
                openDeviceModal();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
